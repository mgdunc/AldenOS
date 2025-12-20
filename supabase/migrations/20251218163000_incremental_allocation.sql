-- Update allocate_inventory_and_confirm_order to support incremental allocation
-- This allows calling the function multiple times (e.g. after receiving new stock)
-- It calculates "Needed" based on (Ordered - Fulfilled - AlreadyReserved)

CREATE OR REPLACE FUNCTION "public"."allocate_inventory_and_confirm_order"("p_order_id" "uuid", "p_new_status" "text") RETURNS json
    LANGUAGE "plpgsql"
    AS $$
DECLARE
    v_line record;
    v_bin record;
    v_qty_needed int;
    v_qty_to_take int;
    v_fully_allocated_order boolean := true;
    v_already_reserved int;
BEGIN
    -- Loop through each Line Item in the Order
    FOR v_line IN SELECT id, product_id, quantity_ordered, quantity_fulfilled FROM sales_order_lines WHERE sales_order_id = p_order_id LOOP
        
        -- Calculate what is currently reserved for this line (from ledger)
        -- We sum change_reserved for this order and product.
        SELECT COALESCE(SUM(change_reserved), 0) INTO v_already_reserved
        FROM inventory_ledger
        WHERE reference_id = p_order_id::text 
          AND product_id = v_line.product_id;

        -- Calculate how many more we need to reserve
        -- Target: Ordered
        -- Current State: Fulfilled (Gone) + Reserved (Held)
        v_qty_needed := v_line.quantity_ordered - COALESCE(v_line.quantity_fulfilled, 0) - v_already_reserved;

        -- If we already have enough reserved/fulfilled, skip this line
        IF v_qty_needed <= 0 THEN
            CONTINUE;
        END IF;

        -- Loop through Bins that have THIS product and are SELLABLE
        FOR v_bin IN 
            SELECT s.location_id, (s.qoh - s.reserved) as available
            FROM inventory_snapshots s
            JOIN locations l ON s.location_id = l.id
            WHERE s.product_id = v_line.product_id 
              AND (s.qoh - s.reserved) > 0
              AND l.is_sellable = true
            ORDER BY (s.qoh - s.reserved) DESC 
        LOOP
            -- Determine how much to take from this specific bin
            IF v_bin.available >= v_qty_needed THEN
                v_qty_to_take := v_qty_needed;
            ELSE
                v_qty_to_take := v_bin.available;
            END IF;

            -- Create Ledger Entry (Trigger will update snapshot.reserved)
            INSERT INTO inventory_ledger (product_id, location_id, transaction_type, change_reserved, reference_id, notes)
            VALUES (v_line.product_id, v_bin.location_id, 'reserved', v_qty_to_take, p_order_id::text, 'Order Allocation');

            -- Calculate Remaining Need
            v_qty_needed := v_qty_needed - v_qty_to_take;

            -- Stop looking if we found enough for this line
            EXIT WHEN v_qty_needed <= 0;
        END LOOP;

        -- If we checked all bins and STILL need items, the order is Short.
        IF v_qty_needed > 0 THEN
            v_fully_allocated_order := false;
        END IF;

    END LOOP;

    -- Final Status Update
    IF v_fully_allocated_order THEN
        -- If fully allocated, move to reserved (unless already partially shipped)
        UPDATE sales_orders 
        SET status = CASE WHEN status = 'partially_shipped' THEN 'partially_shipped' ELSE 'reserved' END
        WHERE id = p_order_id;
        
        RETURN json_build_object('success', true, 'status', 'reserved');
    ELSE
        -- Still waiting for more stock
        UPDATE sales_orders 
        SET status = CASE WHEN status = 'partially_shipped' THEN 'partially_shipped' ELSE 'awaiting_stock' END
        WHERE id = p_order_id;
        
        RETURN json_build_object('success', true, 'status', 'awaiting_stock');
    END IF;
END;
$$;
