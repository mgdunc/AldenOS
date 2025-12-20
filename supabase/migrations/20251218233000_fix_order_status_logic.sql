-- 1. Function to calculate and update Sales Order status
CREATE OR REPLACE FUNCTION "public"."update_sales_order_status_from_fulfillment"("p_order_id" "uuid") 
RETURNS "void"
LANGUAGE "plpgsql"
AS $$
DECLARE
    v_total_ordered bigint;
    v_total_covered bigint; -- In fulfillment (any status except cancelled)
    v_total_shipped bigint; -- Specifically shipped
    v_current_status text;
BEGIN
    -- Get Current Status
    SELECT status INTO v_current_status FROM sales_orders WHERE id = p_order_id;
    
    -- Ignore if Cancelled or Draft (usually)
    IF v_current_status = 'cancelled' THEN RETURN; END IF;

    -- 1. Get Totals
    SELECT COALESCE(SUM(quantity_ordered), 0) INTO v_total_ordered
    FROM sales_order_lines WHERE sales_order_id = p_order_id;

    SELECT 
        COALESCE(SUM(fl.quantity), 0),
        COALESCE(SUM(CASE WHEN f.status = 'shipped' THEN fl.quantity ELSE 0 END), 0)
    INTO v_total_covered, v_total_shipped
    FROM fulfillment_lines fl
    JOIN fulfillments f ON fl.fulfillment_id = f.id
    WHERE f.sales_order_id = p_order_id AND f.status != 'cancelled';

    -- 2. Determine Status
    IF v_total_ordered = 0 THEN RETURN; END IF;

    IF v_total_shipped >= v_total_ordered THEN
        -- All items shipped
        UPDATE sales_orders SET status = 'completed' WHERE id = p_order_id;
    
    ELSIF v_total_covered >= v_total_ordered THEN
        -- All items in fulfillment (picking/packed/shipped mix) but not all shipped
        -- User requested "Fulfillment" status. We'll use 'picking' as the system standard for "In Progress"
        UPDATE sales_orders SET status = 'picking' WHERE id = p_order_id;
    
    ELSIF v_total_covered > 0 THEN
        -- Some items in fulfillment, but not all
        UPDATE sales_orders SET status = 'partially_shipped' WHERE id = p_order_id;
        
    ELSE
        -- No active fulfillments (v_total_covered == 0)
        -- If we were in a fulfillment status, revert to 'confirmed'
        IF v_current_status IN ('picking', 'packed', 'partially_shipped', 'completed') THEN
            UPDATE sales_orders SET status = 'confirmed' WHERE id = p_order_id;
        END IF;
    END IF;
END;
$$;

-- 2. Trigger Function for Fulfillments
CREATE OR REPLACE FUNCTION "public"."trg_fulfillment_status_change"() 
RETURNS "trigger"
LANGUAGE "plpgsql"
AS $$
BEGIN
    PERFORM update_sales_order_status_from_fulfillment(NEW.sales_order_id);
    RETURN NEW;
END;
$$;

-- 3. Trigger Function for Fulfillment Lines
CREATE OR REPLACE FUNCTION "public"."trg_fulfillment_line_change"() 
RETURNS "trigger"
LANGUAGE "plpgsql"
AS $$
DECLARE
    v_order_id uuid;
BEGIN
    IF TG_OP = 'DELETE' THEN
        SELECT sales_order_id INTO v_order_id FROM fulfillments WHERE id = OLD.fulfillment_id;
    ELSE
        SELECT sales_order_id INTO v_order_id FROM fulfillments WHERE id = NEW.fulfillment_id;
    END IF;
    
    PERFORM update_sales_order_status_from_fulfillment(v_order_id);
    RETURN NULL;
END;
$$;

-- 4. Apply Triggers
DROP TRIGGER IF EXISTS "on_fulfillment_status_change" ON "public"."fulfillments";
CREATE TRIGGER "on_fulfillment_status_change"
AFTER INSERT OR UPDATE OF status ON "public"."fulfillments"
FOR EACH ROW
EXECUTE FUNCTION trg_fulfillment_status_change();

DROP TRIGGER IF EXISTS "on_fulfillment_line_change" ON "public"."fulfillment_lines";
CREATE TRIGGER "on_fulfillment_line_change"
AFTER INSERT OR UPDATE OR DELETE ON "public"."fulfillment_lines"
FOR EACH ROW
EXECUTE FUNCTION trg_fulfillment_line_change();

-- 5. Update create_fulfillment_and_reallocate to use this logic
CREATE OR REPLACE FUNCTION "public"."create_fulfillment_and_reallocate"(
    "p_order_id" "uuid", 
    "p_items" jsonb
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
BEGIN
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

        -- Insert Fulfillment Line (Triggers status update)
        INSERT INTO fulfillment_lines (fulfillment_id, sales_order_line_id, quantity)
        VALUES (v_fulfillment_id, v_line_id, v_qty_needed);

        -- Get Product ID
        SELECT * INTO v_line FROM sales_order_lines WHERE id = v_line_id;

        -- 3. Reallocate Stock (Logic Unchanged)
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

            INSERT INTO inventory_ledger (product_id, location_id, transaction_type, change_reserved, reference_id, notes)
            VALUES (v_line.product_id, v_ledger_entry.location_id, 'reserved', -v_qty_to_move, p_order_id::text, 'Moved to Fulfillment ' || v_fulfillment_number);

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

                INSERT INTO inventory_ledger (product_id, location_id, transaction_type, change_reserved, reference_id, notes)
                VALUES (v_line.product_id, v_bin.location_id, 'reserved', v_qty_to_take, v_fulfillment_id::text, 'Fulfillment Allocation (Free Stock)');

                v_qty_needed := v_qty_needed - v_qty_to_take;
            END LOOP;
        END IF;
    END LOOP;

    -- Explicitly call status update once at the end to be sure
    PERFORM update_sales_order_status_from_fulfillment(p_order_id);

    RETURN v_fulfillment_id;
END;
$$;
