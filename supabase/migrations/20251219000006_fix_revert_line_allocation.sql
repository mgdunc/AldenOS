-- Fix: Update revert_line_allocation to handle quantity_allocated correctly
CREATE OR REPLACE FUNCTION "public"."revert_line_allocation"(
    "p_line_id" "uuid",
    "p_idempotency_key" "uuid" DEFAULT NULL
) RETURNS json
LANGUAGE "plpgsql"
AS $$
DECLARE
    v_line record;
    v_loc_record record;
    v_total_unreserved int := 0;
    v_first_entry boolean := true;
BEGIN
    -- Idempotency Check
    IF p_idempotency_key IS NOT NULL AND EXISTS (SELECT 1 FROM inventory_ledger WHERE idempotency_key = p_idempotency_key) THEN
        RETURN json_build_object('success', true, 'message', 'Idempotent skip');
    END IF;

    SELECT * INTO v_line FROM sales_order_lines WHERE id = p_line_id;

    -- Find where we have reserved stock for this order/product
    -- IMPORTANT: We only revert stock that is reserved against the ORDER (reference_id = order_id).
    -- We do NOT revert stock that is in a Fulfillment (reference_id = fulfillment_id).
    FOR v_loc_record IN 
        SELECT location_id, SUM(change_reserved) as reserved_qty
        FROM inventory_ledger
        WHERE reference_id = v_line.sales_order_id::text 
          AND product_id = v_line.product_id
        GROUP BY location_id
        HAVING SUM(change_reserved) > 0
    LOOP
        INSERT INTO inventory_ledger (
            product_id, location_id, transaction_type, change_reserved, reference_id, notes, idempotency_key
        )
        VALUES (
            v_line.product_id, v_loc_record.location_id, 'unreserved', -v_loc_record.reserved_qty, v_line.sales_order_id::text, 'Manual Line Revert',
            CASE WHEN v_first_entry THEN p_idempotency_key ELSE NULL END
        );
        
        v_first_entry := false;
        v_total_unreserved := v_total_unreserved + v_loc_record.reserved_qty;
    END LOOP;

    -- Update Line Allocation
    -- We only subtract what we actually unreserved.
    IF v_total_unreserved > 0 THEN
        UPDATE sales_order_lines 
        SET quantity_allocated = quantity_allocated - v_total_unreserved
        WHERE id = p_line_id;
    END IF;

    -- Update Status
    PERFORM update_sales_order_status_after_allocation(v_line.sales_order_id);

    RETURN json_build_object('success', true, 'unreserved', v_total_unreserved);
END;
$$;
