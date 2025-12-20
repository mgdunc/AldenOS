-- Fix: Update create_fulfillment_and_reallocate to support Idempotency
/**
 * create_fulfillment_and_reallocate
 * 
 * Creates a new Fulfillment record and moves inventory allocation from the Sales Order to the Fulfillment.
 * 
 * @param p_order_id        The UUID of the source Sales Order.
 * @param p_items           JSONB array of items to fulfill: [{ "sales_order_line_id": "...", "quantity": 5 }]
 * @param p_idempotency_key Optional UUID to prevent duplicate fulfillments.
 * 
 * Logic:
 * 1. Checks idempotency key.
 * 2. Creates a new Fulfillment record (status: 'draft').
 * 3. Iterates through the requested items.
 * 4. Moves 'reserved' stock from the Order's allocation to the Fulfillment's allocation.
 *    - First tries to take from existing Order reservations.
 *    - If insufficient, tries to take from free stock (new allocation).
 * 5. Returns the UUID of the created fulfillment.
 */
CREATE OR REPLACE FUNCTION "public"."create_fulfillment_and_reallocate"(
    "p_order_id" "uuid", 
    "p_items" jsonb,
    "p_idempotency_key" "uuid" DEFAULT NULL
) 
RETURNS "uuid"
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
    v_first_entry boolean := true;
BEGIN
    -- Idempotency Check
    IF p_idempotency_key IS NOT NULL AND EXISTS (SELECT 1 FROM inventory_ledger WHERE idempotency_key = p_idempotency_key) THEN
        -- If we already processed this, we need to return the fulfillment ID that was created.
        -- We can find it by looking at the ledger entry with this key.
        SELECT reference_id::uuid INTO v_fulfillment_id 
        FROM inventory_ledger 
        WHERE idempotency_key = p_idempotency_key 
        LIMIT 1;
        
        RETURN v_fulfillment_id;
    END IF;

    -- 1. Create Fulfillment Header
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

        -- Get Product ID
        SELECT * INTO v_line FROM sales_order_lines WHERE id = v_line_id;

        -- 3. Reallocate Stock
        -- A. Move Existing Allocation
        FOR v_ledger_entry IN 
            SELECT location_id, SUM(change_reserved) as reserved_qty
            FROM inventory_ledger
            WHERE reference_id = p_order_id::text AND product_id = v_line.product_id
            GROUP BY location_id
            HAVING SUM(change_reserved) > 0
        LOOP
            IF v_qty_needed <= 0 THEN EXIT; END IF;
            v_qty_to_move := LEAST(v_ledger_entry.reserved_qty, v_qty_needed);

            INSERT INTO inventory_ledger (
                product_id, location_id, transaction_type, change_reserved, reference_id, notes, idempotency_key
            )
            VALUES (
                v_line.product_id, v_ledger_entry.location_id, 'reserved', -v_qty_to_move, p_order_id::text, 'Moved to Fulfillment ' || v_fulfillment_number,
                CASE WHEN v_first_entry THEN p_idempotency_key ELSE NULL END
            );
            v_first_entry := false;

            INSERT INTO inventory_ledger (product_id, location_id, transaction_type, change_reserved, reference_id, notes)
            VALUES (v_line.product_id, v_ledger_entry.location_id, 'reserved', v_qty_to_move, v_fulfillment_id::text, 'Allocated to Fulfillment');

            v_qty_needed := v_qty_needed - v_qty_to_move;
        END LOOP;

        -- B. Take from Free Stock
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

                INSERT INTO inventory_ledger (
                    product_id, location_id, transaction_type, change_reserved, reference_id, notes, idempotency_key
                )
                VALUES (
                    v_line.product_id, v_bin.location_id, 'reserved', v_qty_to_take, v_fulfillment_id::text, 'Fulfillment Allocation (Free Stock)',
                    CASE WHEN v_first_entry THEN p_idempotency_key ELSE NULL END
                );
                v_first_entry := false;

                v_qty_needed := v_qty_needed - v_qty_to_take;
            END LOOP;
        END IF;
    END LOOP;

    PERFORM update_sales_order_status_from_fulfillment(p_order_id);

    RETURN v_fulfillment_id;
END;
$$;
