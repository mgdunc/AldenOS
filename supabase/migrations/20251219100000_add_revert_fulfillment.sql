-- 20251219100000_add_revert_fulfillment.sql

-- Add 'return' to allowed transaction types
ALTER TABLE "public"."inventory_ledger" DROP CONSTRAINT IF EXISTS "inventory_ledger_transaction_type_check";
ALTER TABLE "public"."inventory_ledger" ADD CONSTRAINT "inventory_ledger_transaction_type_check" 
CHECK (("transaction_type" = ANY (ARRAY['purchase'::"text", 'sale'::"text", 'adjustment'::"text", 'transfer'::"text", 'count'::"text", 'po_placed'::"text", 'po_received'::"text", 'reserved'::"text", 'unreserved'::"text", 'return'::"text"])));

/**
 * revert_fulfillment_shipment
 * 
 * Cancels a fulfillment that HAS been shipped (status='shipped').
 * Reverses the inventory deduction and returns stock to the Sales Order allocation.
 * 
 * @param p_fulfillment_id  The UUID of the shipped fulfillment.
 * @param p_idempotency_key Optional UUID to prevent duplicate reversals.
 * 
 * Logic:
 * 1. Verifies the fulfillment is 'shipped'.
 * 2. Iterates through fulfillment lines.
 * 3. Finds the original 'sale' ledger entries that deducted the stock.
 * 4. Creates 'return' ledger entries to add stock back (increasing QOH and Reserved).
 * 5. Updates Sales Order Lines: decreases quantity_fulfilled, increases quantity_allocated.
 * 6. Updates Fulfillment status to 'cancelled'.
 * 7. Updates Sales Order status based on new fulfillment counts.
 */
CREATE OR REPLACE FUNCTION "public"."revert_fulfillment_shipment"(
    "p_fulfillment_id" "uuid",
    "p_idempotency_key" "uuid" DEFAULT NULL
) RETURNS "void"
LANGUAGE "plpgsql"
AS $$
DECLARE
    v_order_id uuid;
    v_line record;
    v_ledger_rec record;
    v_qty_remaining int;
    v_qty_to_revert int;
    v_ordered int;
    v_fulfilled int;
BEGIN
    -- Idempotency Check
    IF p_idempotency_key IS NOT NULL AND EXISTS (SELECT 1 FROM inventory_ledger WHERE idempotency_key = p_idempotency_key) THEN
        RETURN;
    END IF;

    -- 1. Get Context
    SELECT sales_order_id INTO v_order_id FROM fulfillments WHERE id = p_fulfillment_id;
    
    -- Verify it is shipped
    IF NOT EXISTS (SELECT 1 FROM fulfillments WHERE id = p_fulfillment_id AND status = 'shipped') THEN
        RAISE EXCEPTION 'Fulfillment is not shipped';
    END IF;

    -- 2. Loop through items
    FOR v_line IN 
        SELECT fl.quantity, fl.sales_order_line_id, sol.product_id
        FROM fulfillment_lines fl
        JOIN sales_order_lines sol ON fl.sales_order_line_id = sol.id
        WHERE fl.fulfillment_id = p_fulfillment_id
    LOOP
        v_qty_remaining := v_line.quantity;

        -- 3. Find where we deducted stock from (heuristic: look for recent 'sale' transactions for this order)
        FOR v_ledger_rec IN 
            SELECT location_id, ABS(change_qoh) as deducted_qty
            FROM inventory_ledger
            WHERE reference_id = v_order_id::text
            AND product_id = v_line.product_id 
            AND transaction_type = 'sale'
            AND change_qoh < 0
            ORDER BY created_at DESC
        LOOP
            IF v_qty_remaining <= 0 THEN EXIT; END IF;

            v_qty_to_revert := LEAST(v_qty_remaining, v_ledger_rec.deducted_qty);

            -- Add back to Ledger: Increase QOH and Increase Reserved (back to allocated state)
            INSERT INTO inventory_ledger (
                product_id, location_id, transaction_type, change_qoh, change_reserved, reference_id, notes
            ) VALUES (
                v_line.product_id, 
                v_ledger_rec.location_id, 
                'return', 
                v_qty_to_revert, 
                v_qty_to_revert, 
                v_order_id::text, 
                'Fulfillment Unshipped'
            );

            v_qty_remaining := v_qty_remaining - v_qty_to_revert;
        END LOOP;

        -- Fallback: If we couldn't find enough ledger history, put remainder in default location
        IF v_qty_remaining > 0 THEN
             DECLARE v_def_loc uuid;
             BEGIN
                 SELECT id INTO v_def_loc FROM locations LIMIT 1;
                 INSERT INTO inventory_ledger (
                    product_id, location_id, transaction_type, change_qoh, change_reserved, reference_id, notes
                ) VALUES (
                    v_line.product_id, v_def_loc, 'return', v_qty_remaining, v_qty_remaining, v_order_id::text, 'Fulfillment Unshipped (Fallback)'
                );
             END;
        END IF;

        -- 4. Update Sales Order Line (Decrease fulfilled qty, Increase allocated qty)
        UPDATE sales_order_lines
        SET quantity_fulfilled = GREATEST(0, quantity_fulfilled - v_line.quantity),
            quantity_allocated = quantity_allocated + v_line.quantity
        WHERE id = v_line.sales_order_line_id;

    END LOOP;

    -- 5. Update Fulfillment Status
    UPDATE fulfillments 
    SET status = 'cancelled', shipped_at = NULL 
    WHERE id = p_fulfillment_id;

    -- 6. Update Sales Order Status
    SELECT sum(quantity_ordered), sum(quantity_fulfilled)
    INTO v_ordered, v_fulfilled
    FROM sales_order_lines WHERE sales_order_id = v_order_id;

    IF v_fulfilled >= v_ordered THEN
        UPDATE sales_orders SET status = 'shipped' WHERE id = v_order_id;
    ELSIF v_fulfilled > 0 THEN
        UPDATE sales_orders SET status = 'partially_shipped' WHERE id = v_order_id;
    ELSE
        IF EXISTS (SELECT 1 FROM sales_order_lines WHERE sales_order_id = v_order_id AND quantity_allocated > 0) THEN
             UPDATE sales_orders SET status = 'reserved' WHERE id = v_order_id;
        ELSE
             UPDATE sales_orders SET status = 'confirmed' WHERE id = v_order_id;
        END IF;
    END IF;

END;
$$;
