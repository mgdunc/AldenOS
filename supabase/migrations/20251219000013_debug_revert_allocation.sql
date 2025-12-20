-- Debug: Add detailed error reporting to revert_line_allocation and ensure trigger is correct

-- 1. Re-assert the trigger function to be absolutely sure it's correct
CREATE OR REPLACE FUNCTION "public"."update_inventory_snapshot"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  -- Insert or Update the Snapshot for this Product/Location
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

-- 2. Update revert_line_allocation with debug info
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
        FOR UPDATE; -- Critical: Lock to prevent race conditions

        v_snapshot_reserved := COALESCE(v_snapshot_reserved, 0);

        -- We can only unreserve what is actually reserved in the snapshot
        v_qty_to_unreserve := LEAST(v_loc_record.reserved_qty, v_snapshot_reserved);

        IF v_qty_to_unreserve > 0 THEN
            BEGIN
                INSERT INTO inventory_ledger (
                    product_id, location_id, transaction_type, change_reserved, reference_id, notes, idempotency_key
                )
                VALUES (
                    v_line.product_id, v_loc_record.location_id, 'unreserved', -v_qty_to_unreserve, v_line.sales_order_id::text, 'Manual Line Revert',
                    CASE WHEN v_first_entry THEN p_idempotency_key ELSE NULL END
                );
            EXCEPTION WHEN check_violation THEN
                RAISE EXCEPTION 'Check violation during unreserve. Attempted: %, Snapshot: %, Ledger: %, Loc: %', 
                    v_qty_to_unreserve, v_snapshot_reserved, v_loc_record.reserved_qty, v_loc_record.location_id;
            END;
            
            v_first_entry := false;
            v_total_unreserved := v_total_unreserved + v_qty_to_unreserve;
        END IF;
    END LOOP;

    -- Update Line Allocation
    -- We only subtract what we actually unreserved.
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
