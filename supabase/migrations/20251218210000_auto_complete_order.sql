CREATE OR REPLACE FUNCTION "public"."create_fulfillment_and_reallocate"(
    "p_order_id" "uuid", 
    "p_items" jsonb -- Array of { sales_order_line_id, quantity }
) 
RETURNS "uuid" -- Returns the new fulfillment ID
LANGUAGE "plpgsql"
AS $$
DECLARE
    v_fulfillment_id uuid;
    v_fulfillment_number text;
    v_item jsonb;
    v_line_id uuid;
    v_qty_needed int;
    v_line record;
    v_ledger_entry record;
    v_qty_to_move int;
    v_bin record;
    v_qty_to_take int;
    
    -- Variables for status check
    v_total_ordered bigint;
    v_total_fulfilled bigint;
BEGIN
    -- 1. Create Fulfillment Header
    -- Generate Number: FUL-{OrderNum}-{Timestamp}
    SELECT 'FUL-' || order_number || '-' || to_char(now(), 'HH24MISS') INTO v_fulfillment_number
    FROM sales_orders WHERE id = p_order_id;

    INSERT INTO fulfillments (sales_order_id, fulfillment_number, status)
    VALUES (p_order_id, v_fulfillment_number, 'draft')
    RETURNING id INTO v_fulfillment_id;

    -- 2. Process Items
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
        v_line_id := (v_item->>'sales_order_line_id')::uuid;
        v_qty_needed := (v_item->>'quantity')::int;

        -- Insert Fulfillment Line
        INSERT INTO fulfillment_lines (fulfillment_id, sales_order_line_id, quantity)
        VALUES (v_fulfillment_id, v_line_id, v_qty_needed);

        -- Get Product ID from Line
        SELECT * INTO v_line FROM sales_order_lines WHERE id = v_line_id;

        -- 3. Reallocate Stock
        -- Strategy:
        -- A. Take from existing Order Allocation (inventory_ledger where reference_id = OrderID)
        -- B. If not enough, take from Free Stock (inventory_snapshots where qoh > reserved)

        -- A. Move Existing Allocation
        -- Find positive reservations for this order/product
        FOR v_ledger_entry IN 
            SELECT location_id, SUM(change_reserved) as reserved_qty
            FROM inventory_ledger
            WHERE reference_id = p_order_id::text AND product_id = v_line.product_id
            GROUP BY location_id
            HAVING SUM(change_reserved) > 0
        LOOP
            IF v_qty_needed <= 0 THEN EXIT; END IF;

            v_qty_to_move := LEAST(v_ledger_entry.reserved_qty, v_qty_needed);

            -- 1. Unreserve from Order
            INSERT INTO inventory_ledger (product_id, location_id, transaction_type, change_reserved, reference_id, notes)
            VALUES (v_line.product_id, v_ledger_entry.location_id, 'reserved', -v_qty_to_move, p_order_id::text, 'Moved to Fulfillment ' || v_fulfillment_number);

            -- 2. Reserve for Fulfillment
            INSERT INTO inventory_ledger (product_id, location_id, transaction_type, change_reserved, reference_id, notes)
            VALUES (v_line.product_id, v_ledger_entry.location_id, 'reserved', v_qty_to_move, v_fulfillment_id::text, 'Allocated to Fulfillment');

            v_qty_needed := v_qty_needed - v_qty_to_move;
        END LOOP;

        -- B. Take from Free Stock (if needed)
        IF v_qty_needed > 0 THEN
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

                INSERT INTO inventory_ledger (product_id, location_id, transaction_type, change_reserved, reference_id, notes)
                VALUES (v_line.product_id, v_bin.location_id, 'reserved', v_qty_to_take, v_fulfillment_id::text, 'Fulfillment Allocation (Free Stock)');

                v_qty_needed := v_qty_needed - v_qty_to_take;
            END LOOP;
        END IF;

    END LOOP;

    -- 4. Update Order Status
    -- Calculate Total Ordered
    SELECT COALESCE(SUM(quantity_ordered), 0) INTO v_total_ordered
    FROM sales_order_lines
    WHERE sales_order_id = p_order_id;

    -- Calculate Total In Fulfillments (Draft + Shipped + etc)
    SELECT COALESCE(SUM(fl.quantity), 0) INTO v_total_fulfilled
    FROM fulfillment_lines fl
    JOIN fulfillments f ON fl.fulfillment_id = f.id
    WHERE f.sales_order_id = p_order_id;

    IF v_total_fulfilled >= v_total_ordered THEN
        UPDATE sales_orders SET status = 'completed' WHERE id = p_order_id;
    ELSE
        -- If not fully fulfilled, mark as picking (active fulfillment)
        -- But only if it's not already partially_shipped (we don't want to go back from shipped to picking?)
        -- Actually, if we are creating a NEW fulfillment, we ARE picking that new part.
        -- But the order status usually reflects the most advanced state or the general state.
        -- Let's set to 'picking' if it was 'reserved' or 'awaiting_stock'.
        UPDATE sales_orders 
        SET status = 'picking' 
        WHERE id = p_order_id AND status IN ('reserved', 'awaiting_stock', 'confirmed');
    END IF;

    RETURN v_fulfillment_id;
END;
$$;
