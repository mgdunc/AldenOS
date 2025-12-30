-- Fix function overload ambiguity for allocate_inventory_and_confirm_order
-- PostgREST cannot distinguish between the two overloads when the optional parameter has a default

-- Drop the old 2-parameter version (keep only the 3-parameter version with idempotency key)
DROP FUNCTION IF EXISTS public.allocate_inventory_and_confirm_order(uuid, text);

-- Ensure the 3-parameter version exists with proper defaults
CREATE OR REPLACE FUNCTION "public"."allocate_inventory_and_confirm_order"(
    "p_order_id" "uuid", 
    "p_new_status" "text",
    "p_idempotency_key" "uuid" DEFAULT gen_random_uuid()
) RETURNS json
    LANGUAGE "plpgsql"
    AS $$
DECLARE
    v_line record;
    v_bin record;
    v_qty_needed int;
    v_qty_to_take int;
    v_fully_allocated_order boolean := true;
    v_total_allocated int := 0;
    v_already_reserved int;
    v_already_fulfilled int;
BEGIN
    -- Loop through each Line Item in the Order
    FOR v_line IN SELECT id, product_id, quantity_ordered FROM sales_order_lines WHERE sales_order_id = p_order_id LOOP
        
        -- Calculate how much is already reserved for this specific line
        SELECT COALESCE(SUM(quantity_reserved), 0) INTO v_already_reserved
        FROM committed_allocations WHERE line_id = v_line.id;
        
        -- Get fulfilled qty
        SELECT COALESCE(quantity_fulfilled, 0) INTO v_already_fulfilled
        FROM sales_order_lines WHERE id = v_line.id;

        -- The INCREMENTAL need: Ordered - Fulfilled - AlreadyReserved
        v_qty_needed := v_line.quantity_ordered - v_already_fulfilled - v_already_reserved;
        
        -- Skip if this line is already fully covered
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

            -- Create the atomic reservation record
            INSERT INTO committed_allocations (line_id, location_id, quantity_reserved, idempotency_key)
            VALUES (v_line.id, v_bin.location_id, v_qty_to_take, p_idempotency_key)
            ON CONFLICT (line_id, location_id) DO UPDATE SET 
                quantity_reserved = committed_allocations.quantity_reserved + EXCLUDED.quantity_reserved;

            -- Update the snapshot's "reserved" count
            UPDATE inventory_snapshots 
            SET reserved = reserved + v_qty_to_take
            WHERE product_id = v_line.product_id AND location_id = v_bin.location_id;
            
            -- Log the reservation
            INSERT INTO inventory_ledger (product_id, location_id, transaction_type, change_reserved, reference_id, notes)
            VALUES (v_line.product_id, v_bin.location_id, 'reserved', v_qty_to_take, p_order_id::text, 'Order Confirmed');

            v_total_allocated := v_total_allocated + v_qty_to_take;
            v_qty_needed := v_qty_needed - v_qty_to_take;

            -- Exit loop if this line is now fully satisfied
            IF v_qty_needed <= 0 THEN
                EXIT;
            END IF;
        END LOOP;

        -- If we couldn't fully reserve for this line, mark order as not fully allocated
        IF v_qty_needed > 0 THEN
            v_fully_allocated_order := false;
        END IF;
    END LOOP;

    -- Determine the final status
    IF v_fully_allocated_order THEN
        UPDATE sales_orders SET status = 'reserved', is_open = true WHERE id = p_order_id;
    ELSE
        UPDATE sales_orders SET status = 'awaiting_stock', is_open = true WHERE id = p_order_id;
    END IF;

    RETURN json_build_object('success', true, 'fully_allocated', v_fully_allocated_order, 'total_allocated', v_total_allocated);
END;
$$;

-- Grant permissions
GRANT ALL ON FUNCTION "public"."allocate_inventory_and_confirm_order"("p_order_id" "uuid", "p_new_status" "text", "p_idempotency_key" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."allocate_inventory_and_confirm_order"("p_order_id" "uuid", "p_new_status" "text", "p_idempotency_key" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."allocate_inventory_and_confirm_order"("p_order_id" "uuid", "p_new_status" "text", "p_idempotency_key" "uuid") TO "service_role";

