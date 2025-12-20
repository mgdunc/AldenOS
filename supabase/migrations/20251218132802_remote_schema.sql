


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_graphql" WITH SCHEMA "graphql";






CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE OR REPLACE FUNCTION "public"."adjust_stock"("p_product_id" "uuid", "p_location_id" "uuid", "p_quantity" integer, "p_reason" "text") RETURNS json
    LANGUAGE "plpgsql"
    AS $$
declare
  v_current_qoh int;
  v_new_qoh int;
begin
  -- 1. Lock the snapshot row to prevent race conditions
  -- (If User A and User B click save at the exact same millisecond, one waits)
  select qoh into v_current_qoh
  from inventory_snapshots
  where product_id = p_product_id and location_id = p_location_id
  for update; -- This locks the row!

  v_current_qoh := coalesce(v_current_qoh, 0);
  v_new_qoh := v_current_qoh + p_quantity;

  -- 2. Validate Business Logic (Server-Side!)
  if v_new_qoh < 0 then
    -- Throw an error that the frontend can catch
    raise exception 'Insufficient stock. Current: %, Attempted reduction: %', v_current_qoh, abs(p_quantity);
  end if;

  -- 3. Insert into Ledger
  -- (The Trigger we wrote earlier will still fire to update the snapshot automatically,
  --  OR we can update manually here. Let's rely on the trigger for simplicity.)
  insert into inventory_ledger (product_id, location_id, transaction_type, change_qoh, notes)
  values (p_product_id, p_location_id, 'adjustment', p_quantity, p_reason);

  return json_build_object('success', true, 'new_qoh', v_new_qoh);
end;
$$;


ALTER FUNCTION "public"."adjust_stock"("p_product_id" "uuid", "p_location_id" "uuid", "p_quantity" integer, "p_reason" "text") OWNER TO "postgres";


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
        -- We order by "Largest Bin First" to minimize fragmentation
        FOR v_bin IN 
            SELECT s.location_id, (s.qoh - s.reserved) as available
            FROM inventory_snapshots s
            JOIN locations l ON s.location_id = l.id
            WHERE s.product_id = v_line.product_id 
              AND (s.qoh - s.reserved) > 0
              AND l.is_sellable = true -- CRITICAL: Ensure your location is sellable!
            ORDER BY (s.qoh - s.reserved) DESC 
        LOOP
            -- Determine how much to take from this specific bin
            IF v_bin.available >= v_qty_needed THEN
                v_qty_to_take := v_qty_needed;
            ELSE
                v_qty_to_take := v_bin.available;
            END IF;

            -- 1. Reserve the Stock (Update Snapshot)
            UPDATE inventory_snapshots
            SET reserved = reserved + v_qty_to_take
            WHERE product_id = v_line.product_id AND location_id = v_bin.location_id;

            -- 2. Create Ledger Entry (The "Row" you were looking for)
            INSERT INTO inventory_ledger (product_id, location_id, transaction_type, change_reserved, reference_id, notes)
            VALUES (v_line.product_id, v_bin.location_id, 'reserved', v_qty_to_take, p_order_id, 'Order Allocation');

            -- 3. Calculate Remaining Need
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


ALTER FUNCTION "public"."allocate_inventory_and_confirm_order"("p_order_id" "uuid", "p_new_status" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."book_in_stock"("p_product_id" "uuid", "p_location_id" "uuid", "p_quantity" integer, "p_reference_id" "text", "p_notes" "text") RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    INSERT INTO inventory_snapshots (product_id, location_id, qoh)
    VALUES (p_product_id, p_location_id, p_quantity)
    ON CONFLICT (product_id, location_id)
    DO UPDATE SET qoh = inventory_snapshots.qoh + p_quantity;

    INSERT INTO inventory_ledger (
        product_id, location_id, transaction_type, 
        change_qoh, reference_id, notes
    ) VALUES (
        p_product_id, p_location_id, 'po_received', 
        p_quantity, p_reference_id, p_notes
    );
END;
$$;


ALTER FUNCTION "public"."book_in_stock"("p_product_id" "uuid", "p_location_id" "uuid", "p_quantity" integer, "p_reference_id" "text", "p_notes" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_po"("p_product_id" "uuid", "p_location_id" "uuid", "p_quantity" integer, "p_type" "text", "p_reference" "text") RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
begin
  if p_type = 'place' then
    insert into inventory_ledger 
      (product_id, location_id, transaction_type, change_on_order, reference_id)
    values 
      (p_product_id, p_location_id, 'po_placed', p_quantity, p_reference);

  elsif p_type = 'receive' then
    insert into inventory_ledger 
      (product_id, location_id, transaction_type, change_on_order, change_qoh, reference_id)
    values 
      (p_product_id, p_location_id, 'po_received', -p_quantity, p_quantity, p_reference);
  end if;
end;
$$;


ALTER FUNCTION "public"."handle_po"("p_product_id" "uuid", "p_location_id" "uuid", "p_quantity" integer, "p_type" "text", "p_reference" "text") OWNER TO "postgres";


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

        -- 3. DEDUCT INVENTORY (The "Point of No Return" Logic)
        -- Finds reserved stock, deducts QOH, logs to ledger
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

                UPDATE inventory_snapshots
                SET qoh = qoh - v_deduct, reserved = reserved - v_deduct
                WHERE product_id = v_product_id AND location_id = v_snap_loc;

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


ALTER FUNCTION "public"."process_fulfillment_shipment"("p_fulfillment_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."receive_purchase_order"("p_po_id" "uuid", "p_user_id" "uuid", "p_items" "jsonb") RETURNS json
    LANGUAGE "plpgsql"
    AS $$
DECLARE
    v_receipt_id uuid;
    v_item jsonb;
    v_total_ordered int;
    v_total_received int;
    v_po_status text;
    v_po_number text;
BEGIN
    -- 1. GET PO DETAILS & LOCK
    SELECT po_number INTO v_po_number FROM purchase_orders WHERE id = p_po_id;

    -- 2. CREATE RECEIPT HEADER
    INSERT INTO inventory_receipts (purchase_order_id, received_by, received_at)
    VALUES (p_po_id, p_user_id, NOW())
    RETURNING id INTO v_receipt_id;

    -- 3. PROCESS ITEMS
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        -- A. Create Receipt Line (Audit)
        INSERT INTO inventory_receipt_lines (receipt_id, product_id, location_id, quantity_received)
        VALUES (v_receipt_id, (v_item->>'product_id')::uuid, (v_item->>'location_id')::uuid, (v_item->>'qty')::int);

        -- B. Update PO Line (Logic)
        UPDATE purchase_order_lines
        SET quantity_received = quantity_received + (v_item->>'qty')::int
        WHERE id = (v_item->>'line_id')::uuid;

        -- C. Add to Ledger (Physical Stock)
        -- This fires the trigger to update 'inventory_snapshots' automatically
        INSERT INTO inventory_ledger (
            product_id, location_id, transaction_type, change_qoh, reference_id, user_id
        ) VALUES (
            (v_item->>'product_id')::uuid,
            (v_item->>'location_id')::uuid,
            'purchase',
            (v_item->>'qty')::int, -- POSITIVE number increases stock
            v_po_number,
            p_user_id
        );
    END LOOP;

    -- 4. UPDATE PO HEADER STATUS
    -- Check if fully received
    SELECT sum(quantity_ordered), sum(quantity_received) 
    INTO v_total_ordered, v_total_received
    FROM purchase_order_lines 
    WHERE purchase_order_id = p_po_id;

    IF v_total_received >= v_total_ordered THEN
        v_po_status := 'received';
    ELSE
        v_po_status := 'partial';
    END IF;

    UPDATE purchase_orders 
    SET status = v_po_status 
    WHERE id = p_po_id;

    RETURN json_build_object('success', true, 'receipt_id', v_receipt_id, 'status', v_po_status);
END;
$$;


ALTER FUNCTION "public"."receive_purchase_order"("p_po_id" "uuid", "p_user_id" "uuid", "p_items" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."receive_purchase_order_all"("p_po_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
    line_item RECORD;
    v_default_location_id UUID;
BEGIN
    -- Get a default location (e.g., Main Warehouse)
    SELECT id INTO v_default_location_id FROM locations LIMIT 1;

    FOR line_item IN 
        SELECT product_id, quantity_ordered, (quantity_ordered - COALESCE(quantity_received, 0)) as qty_to_receive
        FROM purchase_order_lines 
        WHERE purchase_order_id = p_po_id
    LOOP
        IF line_item.qty_to_receive > 0 THEN
            -- Call our separate booking-in logic
            PERFORM book_in_stock(
                line_item.product_id, 
                v_default_location_id, 
                line_item.qty_to_receive, 
                p_po_id::text, 
                'PO Receipt'
            );

            -- Update PO line
            UPDATE purchase_order_lines 
            SET quantity_received = quantity_ordered 
            WHERE purchase_order_id = p_po_id AND product_id = line_item.product_id;
        END IF;
    END LOOP;

    -- Mark PO as received
    UPDATE purchase_orders SET status = 'received' WHERE id = p_po_id;
END;
$$;


ALTER FUNCTION "public"."receive_purchase_order_all"("p_po_id" "uuid") OWNER TO "postgres";


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
        UPDATE inventory_snapshots 
        SET qoh = qoh - line.quantity_received
        WHERE product_id = line.product_id AND location_id = line.location_id;

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


ALTER FUNCTION "public"."revert_inventory_receipt"("p_receipt_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."ship_fulfillment"("p_fulfillment_id" "uuid", "p_user_id" "uuid") RETURNS json
    LANGUAGE "plpgsql"
    AS $$
DECLARE
    v_fulfillment_record RECORD;
    v_line RECORD;
    v_so_status text;
    v_remaining_items int;
BEGIN
    -- 1. LOCK & VALIDATE
    -- Lock the fulfillment row to prevent concurrent shipping
    SELECT * INTO v_fulfillment_record 
    FROM fulfillments 
    WHERE id = p_fulfillment_id 
    FOR UPDATE;

    IF v_fulfillment_record.status = 'shipped' THEN
        RAISE EXCEPTION 'This fulfillment is already shipped.';
    END IF;

    -- 2. PROCESS LINES (The "Write" Path)
    FOR v_line IN 
        SELECT fl.quantity, fl.sales_order_line_id, sol.product_id, sol.location_id 
        FROM fulfillment_lines fl
        JOIN sales_order_lines sol ON fl.sales_order_line_id = sol.id
        WHERE fl.fulfillment_id = p_fulfillment_id
    LOOP
        -- A. Create Ledger Entry (Decreases Physical QOH)
        -- This fires the Trigger you installed earlier, auto-updating 'inventory_snapshots'
        INSERT INTO inventory_ledger (
            product_id, 
            location_id, 
            transaction_type, 
            change_qoh, 
            reference_id, 
            user_id,
            created_at
        ) VALUES (
            v_line.product_id,
            COALESCE(v_line.location_id, (SELECT id FROM locations WHERE is_default = true LIMIT 1)), -- Fallback if needed
            'sale',
            -v_line.quantity, -- NEGATIVE value decreases stock
            v_fulfillment_record.fulfillment_number,
            p_user_id,
            NOW()
        );

        -- B. Update Commercial Status (Decreases "Reserved" count in View)
        UPDATE sales_order_lines
        SET quantity_fulfilled = COALESCE(quantity_fulfilled, 0) + v_line.quantity
        WHERE id = v_line.sales_order_line_id;
    END LOOP;

    -- 3. UPDATE FULFILLMENT STATUS
    UPDATE fulfillments 
    SET status = 'shipped', shipped_at = NOW() 
    WHERE id = p_fulfillment_id;

    -- 4. UPDATE ORDER HEADER STATUS (Auto-calculate)
    -- Check if any items are left unfulfilled in the entire order
    SELECT SUM(quantity_ordered - quantity_fulfilled) INTO v_remaining_items
    FROM sales_order_lines
    WHERE sales_order_id = v_fulfillment_record.sales_order_id;

    IF v_remaining_items <= 0 THEN
        v_so_status := 'shipped';
    ELSE
        v_so_status := 'partially_shipped';
    END IF;

    UPDATE sales_orders 
    SET status = v_so_status 
    WHERE id = v_fulfillment_record.sales_order_id;

    RETURN json_build_object('success', true, 'status', v_so_status);
END;
$$;


ALTER FUNCTION "public"."ship_fulfillment"("p_fulfillment_id" "uuid", "p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."ship_sales_order_items"("p_order_id" "uuid", "p_items" "jsonb") RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
    item jsonb;
    v_line_id uuid;
    v_qty_to_ship int;
    v_product_id uuid;
    v_current_fulfilled int;
    v_ordered_qty int;
    
    -- Variables for status calculation
    v_total_ordered_sum int;
    v_total_fulfilled_sum int;
BEGIN
    -- Loop through the items user wants to ship
    FOR item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_line_id := (item->>'line_id')::uuid;
        v_qty_to_ship := (item->>'qty_to_ship')::int;

        -- Get current line details
        SELECT product_id, quantity_ordered, quantity_fulfilled 
        INTO v_product_id, v_ordered_qty, v_current_fulfilled
        FROM sales_order_lines 
        WHERE id = v_line_id;

        -- Validation: Prevent over-shipping
        IF (v_current_fulfilled + v_qty_to_ship) > v_ordered_qty THEN
            RAISE EXCEPTION 'Cannot ship more than ordered quantity for line %', v_line_id;
        END IF;

        -- DEDUCT INVENTORY
        -- Iterate through reserved bins until the shipment qty is satisfied.
        DECLARE 
            v_remaining_to_deduct int := v_qty_to_ship;
            v_snap_loc uuid;
            v_snap_reserved int;
            v_deduct_amt int;
        BEGIN
            FOR v_snap_loc, v_snap_reserved IN 
                SELECT location_id, reserved 
                FROM inventory_snapshots 
                WHERE product_id = v_product_id AND reserved > 0
                ORDER BY reserved DESC
            LOOP
                IF v_remaining_to_deduct <= 0 THEN EXIT; END IF;

                -- Take as much as possible from this bin
                v_deduct_amt := LEAST(v_remaining_to_deduct, v_snap_reserved);

                -- Update Snapshot: Remove from QOH (leaves building) and Reserved (no longer held)
                UPDATE inventory_snapshots
                SET qoh = qoh - v_deduct_amt,
                    reserved = reserved - v_deduct_amt
                WHERE product_id = v_product_id AND location_id = v_snap_loc;

                -- Log to Ledger
                INSERT INTO inventory_ledger (
                    product_id, location_id, transaction_type, change_qoh, change_reserved, reference_id, notes
                ) VALUES (
                    v_product_id, v_snap_loc, 'sale', -v_deduct_amt, -v_deduct_amt, p_order_id, 'Order Shipment'
                );

                v_remaining_to_deduct := v_remaining_to_deduct - v_deduct_amt;
            END LOOP;

            -- If we still have amount left to deduct, reserved count was wrong
            IF v_remaining_to_deduct > 0 THEN
                RAISE EXCEPTION 'Data Error: Not enough reserved stock found to ship item.';
            END IF;
        END;

        -- Update the Line Item record
        UPDATE sales_order_lines
        SET quantity_fulfilled = quantity_fulfilled + v_qty_to_ship
        WHERE id = v_line_id;
        
    END LOOP;

    -- AUTO-UPDATE ORDER STATUS
    SELECT 
        SUM(quantity_ordered), 
        SUM(quantity_fulfilled)
    INTO v_total_ordered_sum, v_total_fulfilled_sum
    FROM sales_order_lines 
    WHERE sales_order_id = p_order_id;

    IF v_total_fulfilled_sum = v_total_ordered_sum THEN
        UPDATE sales_orders SET status = 'shipped' WHERE id = p_order_id;
    ELSIF v_total_fulfilled_sum > 0 THEN
        UPDATE sales_orders SET status = 'partially_shipped' WHERE id = p_order_id;
    ELSE
        UPDATE sales_orders SET status = 'reserved' WHERE id = p_order_id;
    END IF;

END;
$$;


ALTER FUNCTION "public"."ship_sales_order_items"("p_order_id" "uuid", "p_items" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_inventory_snapshot"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  -- Insert or Update the Snapshot for this Product/Location
  INSERT INTO public.inventory_snapshots (product_id, location_id, qoh, last_updated)
  VALUES (
    NEW.product_id, 
    NEW.location_id, 
    NEW.change_qoh, -- Initial value if row doesn't exist
    NOW()
  )
  ON CONFLICT (product_id, location_id)
  DO UPDATE SET
    qoh = inventory_snapshots.qoh + NEW.change_qoh, -- The Magic: Auto-Increment/Decrement
    last_updated = NOW();

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_inventory_snapshot"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_order_status_with_revert"("p_order_id" "uuid", "p_new_status" "text") RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
    v_current_status text;
    line record;
    v_loc_id uuid;
BEGIN
    SELECT status INTO v_current_status FROM sales_orders WHERE id = p_order_id;

    IF v_current_status IN ('reserved', 'requires_items') THEN
        FOR line IN SELECT product_id, quantity_ordered FROM sales_order_lines WHERE sales_order_id = p_order_id LOOP
             
             SELECT location_id INTO v_loc_id FROM inventory_snapshots WHERE product_id = line.product_id ORDER BY reserved DESC LIMIT 1;
             
             IF v_loc_id IS NOT NULL THEN
                UPDATE inventory_snapshots SET reserved = reserved - line.quantity_ordered WHERE product_id = line.product_id AND location_id = v_loc_id;

                -- LOGGING: Record -Reserved Change
                INSERT INTO inventory_ledger (product_id, location_id, transaction_type, change_qoh, change_reserved, reference_id, notes)
                VALUES (line.product_id, v_loc_id, 'unreserved', 0, -line.quantity_ordered, p_order_id, 'Order Reverted');
             END IF;
        END LOOP;
    END IF;

    UPDATE sales_orders SET status = p_new_status WHERE id = p_order_id;
END;
$$;


ALTER FUNCTION "public"."update_order_status_with_revert"("p_order_id" "uuid", "p_new_status" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_sales_order_status_after_shipment"("p_order_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
    v_ordered int;
    v_fulfilled int;
BEGIN
    SELECT sum(quantity_ordered), sum(quantity_fulfilled)
    INTO v_ordered, v_fulfilled
    FROM sales_order_lines WHERE sales_order_id = p_order_id;

    IF v_fulfilled >= v_ordered THEN
        UPDATE sales_orders SET status = 'shipped' WHERE id = p_order_id;
    ELSE
        UPDATE sales_orders SET status = 'partially_shipped' WHERE id = p_order_id;
    END IF;
END;
$$;


ALTER FUNCTION "public"."update_sales_order_status_after_shipment"("p_order_id" "uuid") OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."fulfillment_lines" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "fulfillment_id" "uuid",
    "sales_order_line_id" "uuid",
    "quantity" integer,
    CONSTRAINT "fulfillment_lines_quantity_check" CHECK (("quantity" > 0))
);


ALTER TABLE "public"."fulfillment_lines" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."fulfillments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "sales_order_id" "uuid",
    "fulfillment_number" "text",
    "status" "text",
    "tracking_number" "text",
    "carrier" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "shipped_at" timestamp with time zone,
    CONSTRAINT "fulfillments_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'picking'::"text", 'packing'::"text", 'shipped'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."fulfillments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."inventory_ledger" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "product_id" "uuid" NOT NULL,
    "location_id" "uuid" NOT NULL,
    "transaction_type" "text" NOT NULL,
    "reference_id" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "user_id" "uuid" DEFAULT "auth"."uid"(),
    "change_qoh" integer DEFAULT 0,
    "change_reserved" integer DEFAULT 0,
    "change_on_order" integer DEFAULT 0,
    "change_available" integer DEFAULT 0,
    "notes" "text",
    CONSTRAINT "inventory_ledger_transaction_type_check" CHECK (("transaction_type" = ANY (ARRAY['purchase'::"text", 'sale'::"text", 'adjustment'::"text", 'transfer'::"text", 'count'::"text", 'po_placed'::"text", 'po_received'::"text", 'reserved'::"text", 'unreserved'::"text"])))
);


ALTER TABLE "public"."inventory_ledger" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."inventory_receipt_lines" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "receipt_id" "uuid",
    "product_id" "uuid",
    "location_id" "uuid",
    "quantity_received" integer NOT NULL
);


ALTER TABLE "public"."inventory_receipt_lines" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."inventory_receipts" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "receipt_number" "text" DEFAULT ('REC-'::"text" || "upper"(SUBSTRING(("extensions"."uuid_generate_v4"())::"text" FROM 1 FOR 8))),
    "purchase_order_id" "uuid",
    "received_by" "uuid",
    "received_at" timestamp with time zone DEFAULT "now"(),
    "notes" "text",
    "attachment_url" "text"
);


ALTER TABLE "public"."inventory_receipts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."inventory_snapshots" (
    "product_id" "uuid" NOT NULL,
    "location_id" "uuid" NOT NULL,
    "qoh" integer DEFAULT 0,
    "reserved" integer DEFAULT 0,
    "on_order" integer DEFAULT 0,
    "available" integer GENERATED ALWAYS AS (("qoh" - "reserved")) STORED,
    "last_updated" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."inventory_snapshots" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."locations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "description" "text",
    "is_sellable" boolean DEFAULT true,
    "is_default" boolean DEFAULT false
);


ALTER TABLE "public"."locations" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."product_inventory_view" AS
SELECT
    NULL::"uuid" AS "product_id",
    NULL::"text" AS "sku",
    NULL::"text" AS "name",
    NULL::integer AS "reorder_point",
    NULL::bigint AS "qoh",
    NULL::bigint AS "reserved",
    NULL::bigint AS "on_order",
    NULL::bigint AS "available";


ALTER VIEW "public"."product_inventory_view" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."products" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "sku" "text" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "reorder_point" integer DEFAULT 10,
    "price_cost" numeric(10,2),
    "attributes" "jsonb" DEFAULT '{}'::"jsonb",
    "barcode" "text",
    "carton_qty" integer DEFAULT 1,
    "carton_barcode" "text",
    "status" "text" DEFAULT 'active'::"text",
    "list_price" numeric(10,2),
    "cost_price" numeric(10,2),
    "supplier_id" "uuid",
    CONSTRAINT "products_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'inactive'::"text", 'archived'::"text", 'clearance'::"text", 'discontinued'::"text", 'exclusive/na'::"text", 'suspended'::"text"])))
);


ALTER TABLE "public"."products" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."purchase_order_lines" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "purchase_order_id" "uuid",
    "product_id" "uuid",
    "quantity_ordered" integer NOT NULL,
    "quantity_received" integer DEFAULT 0,
    "unit_cost" numeric(10,2) DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "purchase_order_lines_quantity_ordered_check" CHECK (("quantity_ordered" > 0))
);


ALTER TABLE "public"."purchase_order_lines" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."purchase_order_seq"
    START WITH 1001
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."purchase_order_seq" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."purchase_orders" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "po_number" "text" DEFAULT ('PO-'::"text" || "nextval"('"public"."purchase_order_seq"'::"regclass")) NOT NULL,
    "supplier_name" "text" NOT NULL,
    "status" "text" DEFAULT 'draft'::"text",
    "expected_date" "date",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "supplier_id" "uuid",
    "attachment_url" "text"
);


ALTER TABLE "public"."purchase_orders" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."sales_order_lines" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "sales_order_id" "uuid" NOT NULL,
    "product_id" "uuid" NOT NULL,
    "location_id" "uuid",
    "quantity_ordered" integer NOT NULL,
    "quantity_fulfilled" integer DEFAULT 0,
    "unit_price" numeric NOT NULL,
    "line_total" numeric GENERATED ALWAYS AS ((("quantity_ordered")::numeric * "unit_price")) STORED,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "sales_order_lines_quantity_ordered_check" CHECK (("quantity_ordered" > 0))
);


ALTER TABLE "public"."sales_order_lines" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."sales_order_seq"
    START WITH 1001
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."sales_order_seq" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."sales_orders" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "order_number" "text" DEFAULT ('SO-'::"text" || "nextval"('"public"."sales_order_seq"'::"regclass")) NOT NULL,
    "customer_name" "text",
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "total_amount" numeric DEFAULT 0,
    "reserved_inventory" boolean DEFAULT false,
    "dispatch_date" "date"
);


ALTER TABLE "public"."sales_orders" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."suppliers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "contact_name" "text",
    "email" "text",
    "phone" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."suppliers" OWNER TO "postgres";


ALTER TABLE ONLY "public"."fulfillment_lines"
    ADD CONSTRAINT "fulfillment_lines_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."fulfillments"
    ADD CONSTRAINT "fulfillments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."inventory_ledger"
    ADD CONSTRAINT "inventory_ledger_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."inventory_receipt_lines"
    ADD CONSTRAINT "inventory_receipt_lines_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."inventory_receipts"
    ADD CONSTRAINT "inventory_receipts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."inventory_receipts"
    ADD CONSTRAINT "inventory_receipts_receipt_number_key" UNIQUE ("receipt_number");



ALTER TABLE ONLY "public"."inventory_snapshots"
    ADD CONSTRAINT "inventory_snapshots_pkey" PRIMARY KEY ("product_id", "location_id");



ALTER TABLE ONLY "public"."locations"
    ADD CONSTRAINT "locations_name_key" UNIQUE ("name");



ALTER TABLE ONLY "public"."locations"
    ADD CONSTRAINT "locations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."products"
    ADD CONSTRAINT "products_barcode_key" UNIQUE ("barcode");



ALTER TABLE ONLY "public"."products"
    ADD CONSTRAINT "products_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."products"
    ADD CONSTRAINT "products_sku_key" UNIQUE ("sku");



ALTER TABLE ONLY "public"."purchase_order_lines"
    ADD CONSTRAINT "purchase_order_lines_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."purchase_orders"
    ADD CONSTRAINT "purchase_orders_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."purchase_orders"
    ADD CONSTRAINT "purchase_orders_po_number_key" UNIQUE ("po_number");



ALTER TABLE ONLY "public"."sales_order_lines"
    ADD CONSTRAINT "sales_order_lines_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."sales_order_lines"
    ADD CONSTRAINT "sales_order_lines_sales_order_id_product_id_key" UNIQUE ("sales_order_id", "product_id");



ALTER TABLE ONLY "public"."sales_orders"
    ADD CONSTRAINT "sales_orders_order_number_key" UNIQUE ("order_number");



ALTER TABLE ONLY "public"."sales_orders"
    ADD CONSTRAINT "sales_orders_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."suppliers"
    ADD CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id");



CREATE INDEX "idx_po_lines_product" ON "public"."purchase_order_lines" USING "btree" ("product_id");



CREATE INDEX "idx_so_lines_product" ON "public"."sales_order_lines" USING "btree" ("product_id");



CREATE OR REPLACE VIEW "public"."product_inventory_view" AS
 SELECT "p"."id" AS "product_id",
    "p"."sku",
    "p"."name",
    "p"."reorder_point",
    COALESCE("sum"("s"."qoh"), (0)::bigint) AS "qoh",
    COALESCE(( SELECT "sum"(("sol"."quantity_ordered" - "sol"."quantity_fulfilled")) AS "sum"
           FROM ("public"."sales_order_lines" "sol"
             JOIN "public"."sales_orders" "so" ON (("sol"."sales_order_id" = "so"."id")))
          WHERE (("sol"."product_id" = "p"."id") AND ("so"."status" = ANY (ARRAY['confirmed'::"text", 'reserved'::"text", 'awaiting_stock'::"text"])))), (0)::bigint) AS "reserved",
    COALESCE(( SELECT "sum"(("pol"."quantity_ordered" - "pol"."quantity_received")) AS "sum"
           FROM ("public"."purchase_order_lines" "pol"
             JOIN "public"."purchase_orders" "po" ON (("pol"."purchase_order_id" = "po"."id")))
          WHERE (("pol"."product_id" = "p"."id") AND ("po"."status" = ANY (ARRAY['placed'::"text", 'partial'::"text"])))), (0)::bigint) AS "on_order",
    (COALESCE("sum"("s"."qoh"), (0)::bigint) - COALESCE(( SELECT "sum"(("sol"."quantity_ordered" - "sol"."quantity_fulfilled")) AS "sum"
           FROM ("public"."sales_order_lines" "sol"
             JOIN "public"."sales_orders" "so" ON (("sol"."sales_order_id" = "so"."id")))
          WHERE (("sol"."product_id" = "p"."id") AND ("so"."status" = ANY (ARRAY['confirmed'::"text", 'reserved'::"text", 'awaiting_stock'::"text"])))), (0)::bigint)) AS "available"
   FROM ("public"."products" "p"
     LEFT JOIN "public"."inventory_snapshots" "s" ON (("p"."id" = "s"."product_id")))
  GROUP BY "p"."id";



CREATE OR REPLACE TRIGGER "on_ledger_insert" AFTER INSERT ON "public"."inventory_ledger" FOR EACH ROW EXECUTE FUNCTION "public"."update_inventory_snapshot"();



CREATE OR REPLACE TRIGGER "trg_update_inventory_snapshot" AFTER INSERT ON "public"."inventory_ledger" FOR EACH ROW EXECUTE FUNCTION "public"."update_inventory_snapshot"();



ALTER TABLE ONLY "public"."fulfillment_lines"
    ADD CONSTRAINT "fulfillment_lines_fulfillment_id_fkey" FOREIGN KEY ("fulfillment_id") REFERENCES "public"."fulfillments"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."fulfillment_lines"
    ADD CONSTRAINT "fulfillment_lines_sales_order_line_id_fkey" FOREIGN KEY ("sales_order_line_id") REFERENCES "public"."sales_order_lines"("id");



ALTER TABLE ONLY "public"."fulfillments"
    ADD CONSTRAINT "fulfillments_sales_order_id_fkey" FOREIGN KEY ("sales_order_id") REFERENCES "public"."sales_orders"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."inventory_ledger"
    ADD CONSTRAINT "inventory_ledger_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id");



ALTER TABLE ONLY "public"."inventory_ledger"
    ADD CONSTRAINT "inventory_ledger_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id");



ALTER TABLE ONLY "public"."inventory_receipt_lines"
    ADD CONSTRAINT "inventory_receipt_lines_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id");



ALTER TABLE ONLY "public"."inventory_receipt_lines"
    ADD CONSTRAINT "inventory_receipt_lines_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id");



ALTER TABLE ONLY "public"."inventory_receipt_lines"
    ADD CONSTRAINT "inventory_receipt_lines_receipt_id_fkey" FOREIGN KEY ("receipt_id") REFERENCES "public"."inventory_receipts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."inventory_receipts"
    ADD CONSTRAINT "inventory_receipts_purchase_order_id_fkey" FOREIGN KEY ("purchase_order_id") REFERENCES "public"."purchase_orders"("id");



ALTER TABLE ONLY "public"."inventory_receipts"
    ADD CONSTRAINT "inventory_receipts_received_by_fkey" FOREIGN KEY ("received_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."inventory_snapshots"
    ADD CONSTRAINT "inventory_snapshots_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id");



ALTER TABLE ONLY "public"."inventory_snapshots"
    ADD CONSTRAINT "inventory_snapshots_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id");



ALTER TABLE ONLY "public"."products"
    ADD CONSTRAINT "products_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."purchase_order_lines"
    ADD CONSTRAINT "purchase_order_lines_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id");



ALTER TABLE ONLY "public"."purchase_order_lines"
    ADD CONSTRAINT "purchase_order_lines_purchase_order_id_fkey" FOREIGN KEY ("purchase_order_id") REFERENCES "public"."purchase_orders"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."purchase_orders"
    ADD CONSTRAINT "purchase_orders_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id");



ALTER TABLE ONLY "public"."sales_order_lines"
    ADD CONSTRAINT "sales_order_lines_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."sales_order_lines"
    ADD CONSTRAINT "sales_order_lines_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id");



ALTER TABLE ONLY "public"."sales_order_lines"
    ADD CONSTRAINT "sales_order_lines_sales_order_id_fkey" FOREIGN KEY ("sales_order_id") REFERENCES "public"."sales_orders"("id") ON DELETE CASCADE;



CREATE POLICY "Allow all access" ON "public"."purchase_order_lines" TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "Allow all access" ON "public"."purchase_orders" TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "Allow all access" ON "public"."suppliers" TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "Enable delete access for authenticated users" ON "public"."purchase_order_lines" FOR DELETE TO "authenticated" USING (true);



CREATE POLICY "Enable delete access for authenticated users" ON "public"."purchase_orders" FOR DELETE TO "authenticated" USING (true);



CREATE POLICY "Enable full access for all users" ON "public"."inventory_snapshots" USING (true) WITH CHECK (true);



CREATE POLICY "Enable full access for authenticated users on sales_order_lines" ON "public"."sales_order_lines" TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "Enable full access for authenticated users on sales_orders" ON "public"."sales_orders" TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "Enable insert access for authenticated users" ON "public"."inventory_ledger" FOR INSERT WITH CHECK (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Enable insert access for authenticated users" ON "public"."purchase_order_lines" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "Enable insert access for authenticated users" ON "public"."purchase_orders" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "Enable insert for all users" ON "public"."inventory_ledger" FOR INSERT WITH CHECK (true);



CREATE POLICY "Enable insert for authenticated users only" ON "public"."fulfillment_lines" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "Enable insert for authenticated users only" ON "public"."fulfillments" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "Enable insert for authenticated users only" ON "public"."inventory_ledger" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "Enable read access for all users" ON "public"."inventory_ledger" FOR SELECT USING (true);



CREATE POLICY "Enable read access for all users" ON "public"."locations" FOR SELECT USING (true);



CREATE POLICY "Enable read access for all users" ON "public"."products" FOR SELECT USING (true);



CREATE POLICY "Enable read access for authenticated users" ON "public"."inventory_ledger" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Enable read access for authenticated users" ON "public"."locations" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Enable read access for authenticated users" ON "public"."purchase_order_lines" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Enable read access for authenticated users" ON "public"."purchase_orders" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Enable read access for authenticated users" ON "public"."suppliers" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Enable select for authenticated users only" ON "public"."fulfillment_lines" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Enable select for authenticated users only" ON "public"."fulfillments" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Enable update access for authenticated users" ON "public"."purchase_order_lines" FOR UPDATE TO "authenticated" USING (true);



CREATE POLICY "Enable update access for authenticated users" ON "public"."purchase_orders" FOR UPDATE TO "authenticated" USING (true);



CREATE POLICY "fully_open_fulfillment_lines" ON "public"."fulfillment_lines" TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "fully_open_fulfillments" ON "public"."fulfillments" TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "staff_all_po_lines" ON "public"."purchase_order_lines" TO "authenticated" USING (true);



CREATE POLICY "staff_all_receipt_lines" ON "public"."inventory_receipt_lines" TO "authenticated" USING (true);



CREATE POLICY "staff_create_po" ON "public"."purchase_orders" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "staff_create_receipts" ON "public"."inventory_receipts" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "staff_read_po" ON "public"."purchase_orders" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "staff_read_receipts" ON "public"."inventory_receipts" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "staff_read_suppliers" ON "public"."suppliers" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "staff_update_po" ON "public"."purchase_orders" FOR UPDATE TO "authenticated" USING (true);





ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";

























































































































































GRANT ALL ON FUNCTION "public"."adjust_stock"("p_product_id" "uuid", "p_location_id" "uuid", "p_quantity" integer, "p_reason" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."adjust_stock"("p_product_id" "uuid", "p_location_id" "uuid", "p_quantity" integer, "p_reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."adjust_stock"("p_product_id" "uuid", "p_location_id" "uuid", "p_quantity" integer, "p_reason" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."allocate_inventory_and_confirm_order"("p_order_id" "uuid", "p_new_status" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."allocate_inventory_and_confirm_order"("p_order_id" "uuid", "p_new_status" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."allocate_inventory_and_confirm_order"("p_order_id" "uuid", "p_new_status" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."book_in_stock"("p_product_id" "uuid", "p_location_id" "uuid", "p_quantity" integer, "p_reference_id" "text", "p_notes" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."book_in_stock"("p_product_id" "uuid", "p_location_id" "uuid", "p_quantity" integer, "p_reference_id" "text", "p_notes" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."book_in_stock"("p_product_id" "uuid", "p_location_id" "uuid", "p_quantity" integer, "p_reference_id" "text", "p_notes" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_po"("p_product_id" "uuid", "p_location_id" "uuid", "p_quantity" integer, "p_type" "text", "p_reference" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."handle_po"("p_product_id" "uuid", "p_location_id" "uuid", "p_quantity" integer, "p_type" "text", "p_reference" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_po"("p_product_id" "uuid", "p_location_id" "uuid", "p_quantity" integer, "p_type" "text", "p_reference" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."process_fulfillment_shipment"("p_fulfillment_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."process_fulfillment_shipment"("p_fulfillment_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."process_fulfillment_shipment"("p_fulfillment_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."receive_purchase_order"("p_po_id" "uuid", "p_user_id" "uuid", "p_items" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."receive_purchase_order"("p_po_id" "uuid", "p_user_id" "uuid", "p_items" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."receive_purchase_order"("p_po_id" "uuid", "p_user_id" "uuid", "p_items" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."receive_purchase_order_all"("p_po_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."receive_purchase_order_all"("p_po_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."receive_purchase_order_all"("p_po_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."revert_inventory_receipt"("p_receipt_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."revert_inventory_receipt"("p_receipt_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."revert_inventory_receipt"("p_receipt_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."ship_fulfillment"("p_fulfillment_id" "uuid", "p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."ship_fulfillment"("p_fulfillment_id" "uuid", "p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."ship_fulfillment"("p_fulfillment_id" "uuid", "p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."ship_sales_order_items"("p_order_id" "uuid", "p_items" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."ship_sales_order_items"("p_order_id" "uuid", "p_items" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."ship_sales_order_items"("p_order_id" "uuid", "p_items" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."update_inventory_snapshot"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_inventory_snapshot"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_inventory_snapshot"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_order_status_with_revert"("p_order_id" "uuid", "p_new_status" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."update_order_status_with_revert"("p_order_id" "uuid", "p_new_status" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_order_status_with_revert"("p_order_id" "uuid", "p_new_status" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."update_sales_order_status_after_shipment"("p_order_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."update_sales_order_status_after_shipment"("p_order_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_sales_order_status_after_shipment"("p_order_id" "uuid") TO "service_role";


















GRANT ALL ON TABLE "public"."fulfillment_lines" TO "anon";
GRANT ALL ON TABLE "public"."fulfillment_lines" TO "authenticated";
GRANT ALL ON TABLE "public"."fulfillment_lines" TO "service_role";



GRANT ALL ON TABLE "public"."fulfillments" TO "anon";
GRANT ALL ON TABLE "public"."fulfillments" TO "authenticated";
GRANT ALL ON TABLE "public"."fulfillments" TO "service_role";



GRANT ALL ON TABLE "public"."inventory_ledger" TO "anon";
GRANT ALL ON TABLE "public"."inventory_ledger" TO "authenticated";
GRANT ALL ON TABLE "public"."inventory_ledger" TO "service_role";



GRANT ALL ON TABLE "public"."inventory_receipt_lines" TO "anon";
GRANT ALL ON TABLE "public"."inventory_receipt_lines" TO "authenticated";
GRANT ALL ON TABLE "public"."inventory_receipt_lines" TO "service_role";



GRANT ALL ON TABLE "public"."inventory_receipts" TO "anon";
GRANT ALL ON TABLE "public"."inventory_receipts" TO "authenticated";
GRANT ALL ON TABLE "public"."inventory_receipts" TO "service_role";



GRANT ALL ON TABLE "public"."inventory_snapshots" TO "anon";
GRANT ALL ON TABLE "public"."inventory_snapshots" TO "authenticated";
GRANT ALL ON TABLE "public"."inventory_snapshots" TO "service_role";



GRANT ALL ON TABLE "public"."locations" TO "anon";
GRANT ALL ON TABLE "public"."locations" TO "authenticated";
GRANT ALL ON TABLE "public"."locations" TO "service_role";



GRANT ALL ON TABLE "public"."product_inventory_view" TO "anon";
GRANT ALL ON TABLE "public"."product_inventory_view" TO "authenticated";
GRANT ALL ON TABLE "public"."product_inventory_view" TO "service_role";



GRANT ALL ON TABLE "public"."products" TO "anon";
GRANT ALL ON TABLE "public"."products" TO "authenticated";
GRANT ALL ON TABLE "public"."products" TO "service_role";



GRANT ALL ON TABLE "public"."purchase_order_lines" TO "anon";
GRANT ALL ON TABLE "public"."purchase_order_lines" TO "authenticated";
GRANT ALL ON TABLE "public"."purchase_order_lines" TO "service_role";



GRANT ALL ON SEQUENCE "public"."purchase_order_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."purchase_order_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."purchase_order_seq" TO "service_role";



GRANT ALL ON TABLE "public"."purchase_orders" TO "anon";
GRANT ALL ON TABLE "public"."purchase_orders" TO "authenticated";
GRANT ALL ON TABLE "public"."purchase_orders" TO "service_role";



GRANT ALL ON TABLE "public"."sales_order_lines" TO "anon";
GRANT ALL ON TABLE "public"."sales_order_lines" TO "authenticated";
GRANT ALL ON TABLE "public"."sales_order_lines" TO "service_role";



GRANT ALL ON SEQUENCE "public"."sales_order_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."sales_order_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."sales_order_seq" TO "service_role";



GRANT ALL ON TABLE "public"."sales_orders" TO "anon";
GRANT ALL ON TABLE "public"."sales_orders" TO "authenticated";
GRANT ALL ON TABLE "public"."sales_orders" TO "service_role";



GRANT ALL ON TABLE "public"."suppliers" TO "anon";
GRANT ALL ON TABLE "public"."suppliers" TO "authenticated";
GRANT ALL ON TABLE "public"."suppliers" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";































drop extension if exists "pg_net";


  create policy "Allow All Access"
  on "storage"."objects"
  as permissive
  for all
  to public
using ((bucket_id = 'po-attachments'::text))
with check ((bucket_id = 'po-attachments'::text));



  create policy "Allow PO Attachments"
  on "storage"."objects"
  as permissive
  for all
  to public
using ((bucket_id = 'po-attachments'::text))
with check ((bucket_id = 'po-attachments'::text));



