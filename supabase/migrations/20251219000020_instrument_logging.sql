-- Instrument the problematic functions with logging

-- 1. Update the Trigger to log exactly what it's doing
CREATE OR REPLACE FUNCTION "public"."update_inventory_snapshot"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
    v_old_reserved int;
    v_new_reserved int;
    v_old_qoh int;
    v_new_qoh int;
BEGIN
  -- Get old values
  SELECT reserved, qoh INTO v_old_reserved, v_old_qoh 
  FROM inventory_snapshots 
  WHERE product_id = NEW.product_id AND location_id = NEW.location_id;

  v_old_reserved := COALESCE(v_old_reserved, 0);
  v_old_qoh := COALESCE(v_old_qoh, 0);

  -- Calculate new values (for logging purposes, before the actual update)
  v_new_reserved := v_old_reserved + COALESCE(NEW.change_reserved, 0);
  v_new_qoh := v_old_qoh + COALESCE(NEW.change_qoh, 0);

  -- Log the attempt
  PERFORM log_system_event(
      'DEBUG', 
      'update_inventory_snapshot', 
      'Updating Snapshot', 
      jsonb_build_object(
          'product_id', NEW.product_id,
          'location_id', NEW.location_id,
          'old_reserved', v_old_reserved,
          'change_reserved', NEW.change_reserved,
          'new_reserved_calc', v_new_reserved,
          'old_qoh', v_old_qoh,
          'change_qoh', NEW.change_qoh,
          'new_qoh_calc', v_new_qoh
      )
  );

  -- Perform Update
  INSERT INTO public.inventory_snapshots (product_id, location_id, qoh, reserved, last_updated)
  VALUES (
    NEW.product_id, 
    NEW.location_id, 
    COALESCE(NEW.change_qoh, 0), 
    COALESCE(NEW.change_reserved, 0),
    NOW()
  )
  ON CONFLICT (product_id, location_id)
  DO UPDATE SET
    qoh = COALESCE(inventory_snapshots.qoh, 0) + COALESCE(NEW.change_qoh, 0),
    reserved = COALESCE(inventory_snapshots.reserved, 0) + COALESCE(NEW.change_reserved, 0),
    last_updated = NOW();

  RETURN NEW;
END;
$$;

-- 2. Update revert_line_allocation to log errors to the table
CREATE OR REPLACE FUNCTION "public"."revert_line_allocation"(
    "p_line_id" "uuid",
    "p_idempotency_key" "uuid" DEFAULT NULL
) RETURNS json
LANGUAGE "plpgsql"
AS $$
DECLARE
    v_line record;
    v_loc_record record;
    v_snapshot_reserved int;
    v_qty_to_unreserve int;
    v_total_unreserved int := 0;
    v_first_entry boolean := true;
BEGIN
    -- Idempotency Check
    IF p_idempotency_key IS NOT NULL AND EXISTS (SELECT 1 FROM inventory_ledger WHERE idempotency_key = p_idempotency_key) THEN
        RETURN json_build_object('success', true, 'message', 'Idempotent skip');
    END IF;

    SELECT * INTO v_line FROM sales_order_lines WHERE id = p_line_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Line item not found';
    END IF;

    -- Find where we have reserved stock for this order/product
    FOR v_loc_record IN 
        SELECT location_id, SUM(change_reserved) as reserved_qty
        FROM inventory_ledger
        WHERE reference_id = v_line.sales_order_id::text 
          AND product_id = v_line.product_id
        GROUP BY location_id
        HAVING SUM(change_reserved) > 0
    LOOP
        -- SAFETY CHECK: Check actual reserved quantity in snapshot AND LOCK THE ROW
        SELECT reserved INTO v_snapshot_reserved
        FROM inventory_snapshots
        WHERE product_id = v_line.product_id AND location_id = v_loc_record.location_id
        FOR UPDATE; 

        v_snapshot_reserved := COALESCE(v_snapshot_reserved, 0);

        -- We can only unreserve what is actually reserved in the snapshot
        v_qty_to_unreserve := LEAST(v_loc_record.reserved_qty, v_snapshot_reserved);

        PERFORM log_system_event(
            'INFO', 
            'revert_line_allocation', 
            'Attempting Unreserve', 
            jsonb_build_object(
                'line_id', p_line_id,
                'ledger_reserved', v_loc_record.reserved_qty,
                'snapshot_reserved', v_snapshot_reserved,
                'qty_to_unreserve', v_qty_to_unreserve
            )
        );

        IF v_qty_to_unreserve > 0 THEN
            BEGIN
                INSERT INTO inventory_ledger (
                    product_id, location_id, transaction_type, change_reserved, reference_id, notes, idempotency_key
                )
                VALUES (
                    v_line.product_id, v_loc_record.location_id, 'unreserved', -v_qty_to_unreserve, v_line.sales_order_id::text, 'Manual Line Revert',
                    CASE WHEN v_first_entry THEN p_idempotency_key ELSE NULL END
                );
            EXCEPTION WHEN OTHERS THEN
                -- Log the specific error
                PERFORM log_system_event(
                    'ERROR', 
                    'revert_line_allocation', 
                    'Transaction Failed', 
                    jsonb_build_object(
                        'error', SQLERRM,
                        'detail', SQLSTATE,
                        'qty_attempted', v_qty_to_unreserve,
                        'snapshot_at_time', v_snapshot_reserved
                    )
                );
                RAISE; -- Re-raise to fail the transaction
            END;
            
            v_first_entry := false;
            v_total_unreserved := v_total_unreserved + v_qty_to_unreserve;
        END IF;
    END LOOP;

    -- Update Line Allocation
    IF v_total_unreserved > 0 THEN
        UPDATE sales_order_lines 
        SET quantity_allocated = GREATEST(0, quantity_allocated - v_total_unreserved)
        WHERE id = p_line_id;
    END IF;

    -- Update Status
    PERFORM update_sales_order_status_after_allocation(v_line.sales_order_id);

    RETURN json_build_object('success', true, 'unreserved', v_total_unreserved);
END;
$$;
