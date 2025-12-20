-- 1. Add Idempotency Key to Ledger
ALTER TABLE "public"."inventory_ledger" 
ADD COLUMN "idempotency_key" uuid UNIQUE;

-- 2. Add Quantity Allocated to Sales Order Lines
ALTER TABLE "public"."sales_order_lines" 
ADD COLUMN "quantity_allocated" integer DEFAULT 0;

-- 3. Backfill Quantity Allocated
-- We calculate the current 'Reserved' status for each line based on the ledger history.
-- Note: This sums up all 'reserved' changes for the Order. 
-- It does NOT include Fulfillments if the reference_id changed to fulfillment_id.
-- However, since we want quantity_allocated to represent the LINE's total reservation,
-- we need to be careful. 
-- For now, let's assume quantity_allocated tracks what is reserved specifically against the ORDER bucket.
-- If it's in a fulfillment, it's still allocated to the line, but maybe we track that separately?
-- User asked for "quantity_allocated on the line". 
-- Let's define: quantity_allocated = Total stock currently reserved for this line (whether in Order or Fulfillment).

WITH calculated_allocation AS (
    SELECT 
        sol.id as line_id,
        COALESCE(SUM(il.change_reserved), 0) as total_reserved
    FROM sales_order_lines sol
    JOIN inventory_ledger il ON il.product_id = sol.product_id
    WHERE 
        -- Match Ledger entries that are linked to this Order OR Fulfillments of this Order
        (il.reference_id = sol.sales_order_id::text)
        OR 
        (il.reference_id IN (SELECT id::text FROM fulfillments WHERE sales_order_id = sol.sales_order_id))
    GROUP BY sol.id
)
UPDATE sales_order_lines sol
SET quantity_allocated = ca.total_reserved
FROM calculated_allocation ca
WHERE sol.id = ca.line_id;


-- 4. UPDATE RPC: allocate_inventory_and_confirm_order
/**
 * allocate_inventory_and_confirm_order
 * 
 * Allocates inventory for a Sales Order and updates its status.
 * 
 * @param p_order_id        The UUID of the Sales Order to allocate.
 * @param p_new_status      The target status (e.g., 'confirmed', 'reserved').
 * @param p_idempotency_key Optional UUID to prevent duplicate executions.
 * 
 * Logic:
 * 1. Checks idempotency key to avoid double allocation.
 * 2. Iterates through each line item in the order.
 * 3. Calculates quantity needed (Ordered - Allocated - Fulfilled).
 * 4. Finds available stock in sellable locations (FIFO/Highest QOH logic).
 * 5. Creates 'reserved' ledger entries to lock stock for this order.
 * 6. Updates the order status based on allocation success.
 */
CREATE OR REPLACE FUNCTION "public"."allocate_inventory_and_confirm_order"(
    "p_order_id" "uuid", 
    "p_new_status" "text",
    "p_idempotency_key" "uuid" DEFAULT NULL
) RETURNS json
    LANGUAGE "plpgsql"
    AS $$
DECLARE
    v_line record;
    v_bin record;
    v_qty_needed int;
    v_qty_to_take int;
    v_fully_allocated_order boolean := true;
    v_total_allocated_for_line int;
BEGIN
    -- Idempotency Check
    IF p_idempotency_key IS NOT NULL AND EXISTS (SELECT 1 FROM inventory_ledger WHERE idempotency_key = p_idempotency_key) THEN
        RETURN json_build_object('success', true, 'status', (SELECT status FROM sales_orders WHERE id = p_order_id), 'message', 'Idempotent skip');
    END IF;

    -- Loop through each Line Item in the Order
    FOR v_line IN SELECT id, product_id, quantity_ordered, quantity_allocated, quantity_fulfilled FROM sales_order_lines WHERE sales_order_id = p_order_id LOOP
        
        -- Calculate what is still needed. 
        -- Needed = Ordered - (Already Allocated + Already Fulfilled)
        -- Note: Usually Fulfilled items are not Allocated anymore.
        v_qty_needed := v_line.quantity_ordered - (v_line.quantity_allocated + v_line.quantity_fulfilled);
        v_total_allocated_for_line := 0;

        IF v_qty_needed > 0 THEN
            -- Loop through Bins
            FOR v_bin IN 
                SELECT s.location_id, (s.qoh - s.reserved) as available
                FROM inventory_snapshots s
                JOIN locations l ON s.location_id = l.id
                WHERE s.product_id = v_line.product_id 
                  AND (s.qoh - s.reserved) > 0
                  AND l.is_sellable = true
                ORDER BY (s.qoh - s.reserved) DESC 
            LOOP
                IF v_qty_needed <= 0 THEN EXIT; END IF;

                v_qty_to_take := LEAST(v_bin.available, v_qty_needed);

                -- Create Ledger Entry
                -- Only the FIRST entry gets the Idempotency Key to prevent unique constraint violation on loop
                -- Actually, if we have one key for the whole batch, we can't apply it to multiple rows if it's UNIQUE.
                -- Strategy: We use the key for the FIRST insert, or we don't enforce UNIQUE on the column but check it manually?
                -- Better: The User passes a key for the ACTION. We log it in a separate 'transaction_log' or we just apply it to one of the entries.
                -- Let's apply it to the first entry we make.
                
                INSERT INTO inventory_ledger (
                    product_id, location_id, transaction_type, change_reserved, reference_id, notes, idempotency_key
                )
                VALUES (
                    v_line.product_id, v_bin.location_id, 'reserved', v_qty_to_take, p_order_id::text, 'Order Allocation', 
                    CASE WHEN v_total_allocated_for_line = 0 AND v_line.id = (SELECT id FROM sales_order_lines WHERE sales_order_id = p_order_id LIMIT 1) THEN p_idempotency_key ELSE NULL END
                );

                v_qty_needed := v_qty_needed - v_qty_to_take;
                v_total_allocated_for_line := v_total_allocated_for_line + v_qty_to_take;
            END LOOP;

            -- Update the Line Item Allocation
            IF v_total_allocated_for_line > 0 THEN
                UPDATE sales_order_lines 
                SET quantity_allocated = quantity_allocated + v_total_allocated_for_line
                WHERE id = v_line.id;
            END IF;
        END IF;

        -- Check if short
        IF v_qty_needed > 0 THEN
            v_fully_allocated_order := false;
        END IF;

    END LOOP;

    -- Final Status Update
    IF v_fully_allocated_order THEN
        UPDATE sales_orders SET status = 'reserved' WHERE id = p_order_id;
        RETURN json_build_object('success', true, 'status', 'reserved');
    ELSE
        UPDATE sales_orders SET status = 'awaiting_stock' WHERE id = p_order_id;
        RETURN json_build_object('success', true, 'status', 'awaiting_stock');
    END IF;
END;
$$;


-- 5. UPDATE RPC: process_fulfillment_shipment
CREATE OR REPLACE FUNCTION "public"."process_fulfillment_shipment"(
    "p_fulfillment_id" "uuid",
    "p_idempotency_key" "uuid" DEFAULT NULL
) RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
    v_line record;
    v_order_id uuid;
    v_product_id uuid;
    v_qty_to_ship int;
    v_so_line_id uuid;
    v_first_entry boolean := true;
BEGIN
    -- Idempotency Check
    IF p_idempotency_key IS NOT NULL AND EXISTS (SELECT 1 FROM inventory_ledger WHERE idempotency_key = p_idempotency_key) THEN
        RETURN;
    END IF;

    -- 1. Get Context
    SELECT sales_order_id INTO v_order_id FROM fulfillments WHERE id = p_fulfillment_id;

    -- 2. Loop through items IN THIS SPECIFIC FULFILLMENT
    FOR v_line IN 
        SELECT fl.quantity, fl.sales_order_line_id, sol.product_id
        FROM fulfillment_lines fl
        JOIN sales_order_lines sol ON fl.sales_order_line_id = sol.id
        WHERE fl.fulfillment_id = p_fulfillment_id
    LOOP
        v_qty_to_ship := v_line.quantity;
        v_product_id := v_line.product_id;
        v_so_line_id := v_line.sales_order_line_id;

        -- 3. DEDUCT INVENTORY
        DECLARE 
            v_remaining int := v_qty_to_ship;
            v_snap_loc uuid;
            v_snap_reserved int;
            v_deduct int;
        BEGIN
            FOR v_snap_loc, v_snap_reserved IN 
                SELECT location_id, reserved FROM inventory_snapshots 
                WHERE product_id = v_product_id AND reserved > 0 ORDER BY reserved DESC
            LOOP
                IF v_remaining <= 0 THEN EXIT; END IF;
                v_deduct := LEAST(v_remaining, v_snap_reserved);

                INSERT INTO inventory_ledger (
                    product_id, location_id, transaction_type, change_qoh, change_reserved, reference_id, notes, idempotency_key
                )
                VALUES (
                    v_product_id, v_snap_loc, 'sale', -v_deduct, -v_deduct, v_order_id::text, 'Fulfillment Shipped',
                    CASE WHEN v_first_entry THEN p_idempotency_key ELSE NULL END
                );
                
                v_first_entry := false;
                v_remaining := v_remaining - v_deduct;
            END LOOP;
        END;

        -- 4. Update Sales Order Line 
        -- Decrease Allocation (it's no longer reserved, it's gone)
        -- Increase Fulfilled
        UPDATE sales_order_lines
        SET quantity_fulfilled = quantity_fulfilled + v_qty_to_ship,
            quantity_allocated = quantity_allocated - v_qty_to_ship
        WHERE id = v_so_line_id;

    END LOOP;

    -- 5. Mark Fulfillment as Shipped
    UPDATE fulfillments 
    SET status = 'shipped', shipped_at = NOW() 
    WHERE id = p_fulfillment_id;

    -- 6. Update Main Order Status
    PERFORM update_sales_order_status_after_shipment(v_order_id);
END;
$$;


-- 6. UPDATE RPC: revert_line_allocation
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
    UPDATE sales_order_lines 
    SET quantity_allocated = quantity_allocated - v_total_unreserved
    WHERE id = p_line_id;

    -- Update Status
    PERFORM update_sales_order_status_after_allocation(v_line.sales_order_id);

    RETURN json_build_object('success', true, 'unreserved', v_total_unreserved);
END;
$$;

-- 7. UPDATE RPC: book_in_stock
CREATE OR REPLACE FUNCTION "public"."book_in_stock"(
    "p_product_id" "uuid", 
    "p_location_id" "uuid", 
    "p_quantity" integer, 
    "p_reference_id" "text", 
    "p_notes" "text",
    "p_idempotency_key" "uuid" DEFAULT NULL
) RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    -- Idempotency Check
    IF p_idempotency_key IS NOT NULL AND EXISTS (SELECT 1 FROM inventory_ledger WHERE idempotency_key = p_idempotency_key) THEN
        RETURN;
    END IF;

    INSERT INTO inventory_ledger (
        product_id, location_id, transaction_type, 
        change_qoh, reference_id, notes, idempotency_key
    ) VALUES (
        p_product_id, p_location_id, 'po_received', 
        p_quantity, p_reference_id, p_notes, p_idempotency_key
    );
END;
$$;
