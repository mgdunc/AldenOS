-- 1. IMPROVE THE TRIGGER FUNCTION
-- Now handles both QOH and RESERVED changes automatically
CREATE OR REPLACE FUNCTION "public"."update_inventory_snapshot"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  -- Insert or Update the Snapshot for this Product/Location
  INSERT INTO public.inventory_snapshots (product_id, location_id, qoh, reserved, last_updated)
  VALUES (
    NEW.product_id, 
    NEW.location_id, 
    NEW.change_qoh, 
    NEW.change_reserved,
    NOW()
  )
  ON CONFLICT (product_id, location_id)
  DO UPDATE SET
    qoh = inventory_snapshots.qoh + NEW.change_qoh,
    reserved = inventory_snapshots.reserved + NEW.change_reserved,
    last_updated = NOW();

  RETURN NEW;
END;
$$;

-- 2. CLEAN UP DUPLICATE TRIGGERS
DROP TRIGGER IF EXISTS "on_ledger_insert" ON "public"."inventory_ledger";
DROP TRIGGER IF EXISTS "trg_update_inventory_snapshot" ON "public"."inventory_ledger";

-- 3. RE-CREATE THE SINGLE SOURCE OF TRUTH TRIGGER
CREATE TRIGGER "trg_update_inventory_snapshot"
AFTER INSERT ON "public"."inventory_ledger"
FOR EACH ROW EXECUTE FUNCTION "public"."update_inventory_snapshot"();


-- 4. FIX FUNCTIONS TO STOP DOUBLE-COUNTING
-- They should ONLY write to the ledger, and let the trigger update the snapshot.

-- Fix: book_in_stock
CREATE OR REPLACE FUNCTION "public"."book_in_stock"("p_product_id" "uuid", "p_location_id" "uuid", "p_quantity" integer, "p_reference_id" "text", "p_notes" "text") RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    -- Removed manual INSERT/UPDATE to inventory_snapshots
    -- The trigger on inventory_ledger will handle it.

    INSERT INTO inventory_ledger (
        product_id, location_id, transaction_type, 
        change_qoh, reference_id, notes
    ) VALUES (
        p_product_id, p_location_id, 'po_received', 
        p_quantity, p_reference_id, p_notes
    );
END;
$$;

-- Fix: allocate_inventory_and_confirm_order
CREATE OR REPLACE FUNCTION "public"."allocate_inventory_and_confirm_order"("p_order_id" "uuid", "p_new_status" "text") RETURNS json
    LANGUAGE "plpgsql"
    AS $$
DECLARE
    v_line record;
    v_bin record;
    v_qty_needed int;
    v_qty_to_take int;
    v_fully_allocated_order boolean := true;
BEGIN
    -- Loop through each Line Item in the Order
    FOR v_line IN SELECT id, product_id, quantity_ordered FROM sales_order_lines WHERE sales_order_id = p_order_id LOOP
        
        v_qty_needed := v_line.quantity_ordered;

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

            -- REMOVED MANUAL UPDATE of inventory_snapshots

            -- Create Ledger Entry (Trigger will update snapshot.reserved)
            INSERT INTO inventory_ledger (product_id, location_id, transaction_type, change_reserved, reference_id, notes)
            VALUES (v_line.product_id, v_bin.location_id, 'reserved', v_qty_to_take, p_order_id, 'Order Allocation');

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
        UPDATE sales_orders SET status = 'reserved' WHERE id = p_order_id;
        RETURN json_build_object('success', true, 'status', 'reserved');
    ELSE
        -- Order confirmed, but waiting for more stock to arrive
        UPDATE sales_orders SET status = 'awaiting_stock' WHERE id = p_order_id;
        RETURN json_build_object('success', true, 'status', 'awaiting_stock');
    END IF;
END;
$$;

-- Fix: process_fulfillment_shipment
CREATE OR REPLACE FUNCTION "public"."process_fulfillment_shipment"("p_fulfillment_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
    v_line record;
    v_order_id uuid;
    v_product_id uuid;
    v_qty_to_ship int;
    v_so_line_id uuid;
BEGIN
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
            -- Find where we have reserved stock for this product
            FOR v_snap_loc, v_snap_reserved IN 
                SELECT location_id, reserved FROM inventory_snapshots 
                WHERE product_id = v_product_id AND reserved > 0 ORDER BY reserved DESC
            LOOP
                IF v_remaining <= 0 THEN EXIT; END IF;
                v_deduct := LEAST(v_remaining, v_snap_reserved);

                -- REMOVED MANUAL UPDATE of inventory_snapshots

                -- Log to ledger: Decrease QOH AND Decrease Reserved (since we are shipping it out)
                INSERT INTO inventory_ledger (product_id, location_id, transaction_type, change_qoh, change_reserved, reference_id, notes)
                VALUES (v_product_id, v_snap_loc, 'sale', -v_deduct, -v_deduct, v_order_id, 'Fulfillment Shipped');

                v_remaining := v_remaining - v_deduct;
            END LOOP;
        END;

        -- 4. Update Sales Order Line (Tracking progress)
        UPDATE sales_order_lines
        SET quantity_fulfilled = quantity_fulfilled + v_qty_to_ship
        WHERE id = v_so_line_id;

    END LOOP;

    -- 5. Mark Fulfillment as Shipped
    UPDATE fulfillments 
    SET status = 'shipped', shipped_at = NOW() 
    WHERE id = p_fulfillment_id;

    -- 6. Update Main Order Status (Check if fully shipped)
    PERFORM update_sales_order_status_after_shipment(v_order_id);
END;
$$;

-- Fix: revert_inventory_receipt
CREATE OR REPLACE FUNCTION "public"."revert_inventory_receipt"("p_receipt_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
    line RECORD;
BEGIN
    -- 1. Check if we have enough stock at the specific locations to revert
    FOR line IN SELECT * FROM inventory_receipt_lines WHERE receipt_id = p_receipt_id
    LOOP
        IF NOT EXISTS (
            SELECT 1 FROM inventory_snapshots 
            WHERE product_id = line.product_id 
            AND location_id = line.location_id 
            AND qoh >= line.quantity_received
        ) THEN
            RAISE EXCEPTION 'Cannot revert: Insufficient stock for SKU in the original location.';
        END IF;
    END LOOP;

    -- 2. Decrement Stock and add Ledger entries
    FOR line IN SELECT * FROM inventory_receipt_lines WHERE receipt_id = p_receipt_id
    LOOP
        -- REMOVED MANUAL UPDATE of inventory_snapshots

        INSERT INTO inventory_ledger (product_id, location_id, transaction_type, change_qoh, reference_id, notes)
        VALUES (line.product_id, line.location_id, 'adjustment', -line.quantity_received, p_receipt_id::text, 'Receipt Reverted');
        
        -- Update PO lines to "un-receive" the quantity
        UPDATE purchase_order_lines pol
        SET quantity_received = pol.quantity_received - line.quantity_received
        FROM inventory_receipts ir
        WHERE ir.id = p_receipt_id 
        AND pol.purchase_order_id = ir.purchase_order_id 
        AND pol.product_id = line.product_id;
    END LOOP;

    -- 3. Mark the receipt as cancelled/deleted (or update status)
    DELETE FROM inventory_receipt_lines WHERE receipt_id = p_receipt_id;
    UPDATE inventory_receipts SET notes = COALESCE(notes, '') || ' [REVERTED]' WHERE id = p_receipt_id;
END;
$$;

-- 5. SIMPLIFY THE VIEW
-- Now that inventory_snapshots is the robust source of truth for QOH and RESERVED,
-- we can simplify the view to just sum them up.
CREATE OR REPLACE VIEW "public"."product_inventory_view" AS
 SELECT "p"."id" AS "product_id",
    "p"."sku",
    "p"."name",
    "p"."reorder_point",
    -- QOH: Sum from snapshots
    COALESCE((SELECT sum(qoh) FROM inventory_snapshots WHERE product_id = p.id), 0) AS "qoh",
    -- RESERVED: Sum from snapshots (Now accurate thanks to trigger)
    COALESCE((SELECT sum(reserved) FROM inventory_snapshots WHERE product_id = p.id), 0) AS "reserved",
    -- ON ORDER: Still calculated from POs (Future stock)
    COALESCE(( 
        SELECT sum(pol.quantity_ordered - pol.quantity_received)
        FROM purchase_order_lines pol
        JOIN purchase_orders po ON pol.purchase_order_id = po.id
        WHERE pol.product_id = p.id AND po.status IN ('placed', 'partial')
    ), 0) AS "on_order",
    -- AVAILABLE: Calculated
    (
        COALESCE((SELECT sum(qoh) FROM inventory_snapshots WHERE product_id = p.id), 0) - 
        COALESCE((SELECT sum(reserved) FROM inventory_snapshots WHERE product_id = p.id), 0)
    ) AS "available"
   FROM "public"."products" "p";
