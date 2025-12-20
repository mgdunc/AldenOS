-- 1. Helper to get current allocations for an order
CREATE OR REPLACE FUNCTION "public"."get_order_allocations"("p_order_id" "uuid") 
RETURNS TABLE (product_id uuid, total_reserved bigint)
LANGUAGE "plpgsql"
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        il.product_id,
        SUM(il.change_reserved) as total_reserved
    FROM inventory_ledger il
    WHERE il.reference_id = p_order_id::text
    GROUP BY il.product_id;
END;
$$;

-- 2. Helper to update order status based on allocation
CREATE OR REPLACE FUNCTION "public"."update_sales_order_status_after_allocation"("p_order_id" "uuid") RETURNS void
LANGUAGE "plpgsql"
AS $$
DECLARE
    v_all_reserved boolean := true;
    v_line record;
    v_reserved int;
BEGIN
    FOR v_line IN SELECT id, product_id, quantity_ordered, quantity_fulfilled FROM sales_order_lines WHERE sales_order_id = p_order_id LOOP
        SELECT COALESCE(SUM(change_reserved), 0) INTO v_reserved
        FROM inventory_ledger
        WHERE reference_id = p_order_id::text AND product_id = v_line.product_id;
        
        IF (v_reserved + COALESCE(v_line.quantity_fulfilled, 0)) < v_line.quantity_ordered THEN
            v_all_reserved := false;
            EXIT;
        END IF;
    END LOOP;

    -- Only update status if it's not already shipped/partially shipped (or maybe we do want to update partially_shipped? 
    -- Let's stick to the main statuses for now. If it's partially_shipped, it stays partially_shipped until fully shipped)
    -- Actually, if we allocate the rest, it's still "partially_shipped" until we SHIP the rest.
    -- So we only toggle between 'confirmed' (draft-ish), 'awaiting_stock', and 'reserved'.
    
    UPDATE sales_orders 
    SET status = CASE 
        WHEN status IN ('partially_shipped', 'shipped') THEN status 
        WHEN v_all_reserved THEN 'reserved' 
        ELSE 'awaiting_stock' 
    END
    WHERE id = p_order_id;
END;
$$;

-- 3. Function to allocate a specific line item
CREATE OR REPLACE FUNCTION "public"."allocate_line_item"("p_line_id" "uuid") RETURNS json
LANGUAGE "plpgsql"
AS $$
DECLARE
    v_line record;
    v_bin record;
    v_qty_needed int;
    v_qty_to_take int;
    v_already_reserved int;
    v_allocated_now int := 0;
BEGIN
    -- Get Line Details
    SELECT * INTO v_line FROM sales_order_lines WHERE id = p_line_id;
    
    -- Calculate current reservation
    SELECT COALESCE(SUM(change_reserved), 0) INTO v_already_reserved
    FROM inventory_ledger
    WHERE reference_id = v_line.sales_order_id::text 
      AND product_id = v_line.product_id;

    -- Calculate Needed
    v_qty_needed := v_line.quantity_ordered - COALESCE(v_line.quantity_fulfilled, 0) - v_already_reserved;

    IF v_qty_needed <= 0 THEN
        RETURN json_build_object('success', false, 'message', 'Line is already fully allocated or fulfilled');
    END IF;

    -- Allocate from Bins
    FOR v_bin IN 
        SELECT s.location_id, (s.qoh - s.reserved) as available
        FROM inventory_snapshots s
        JOIN locations l ON s.location_id = l.id
        WHERE s.product_id = v_line.product_id 
          AND (s.qoh - s.reserved) > 0
          AND l.is_sellable = true
        ORDER BY (s.qoh - s.reserved) DESC 
    LOOP
        IF v_bin.available >= v_qty_needed THEN
            v_qty_to_take := v_qty_needed;
        ELSE
            v_qty_to_take := v_bin.available;
        END IF;

        INSERT INTO inventory_ledger (product_id, location_id, transaction_type, change_reserved, reference_id, notes)
        VALUES (v_line.product_id, v_bin.location_id, 'reserved', v_qty_to_take, v_line.sales_order_id::text, 'Manual Line Allocation');

        v_allocated_now := v_allocated_now + v_qty_to_take;
        v_qty_needed := v_qty_needed - v_qty_to_take;

        EXIT WHEN v_qty_needed <= 0;
    END LOOP;

    -- Update Order Status
    PERFORM update_sales_order_status_after_allocation(v_line.sales_order_id);

    RETURN json_build_object('success', true, 'allocated', v_allocated_now);
END;
$$;

-- 4. Function to revert allocation for a line
CREATE OR REPLACE FUNCTION "public"."revert_line_allocation"("p_line_id" "uuid") RETURNS json
LANGUAGE "plpgsql"
AS $$
DECLARE
    v_line record;
    v_loc_record record;
    v_total_unreserved int := 0;
BEGIN
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
        -- Unreserve (Negative change_reserved)
        INSERT INTO inventory_ledger (product_id, location_id, transaction_type, change_reserved, reference_id, notes)
        VALUES (v_line.product_id, v_loc_record.location_id, 'unreserved', -v_loc_record.reserved_qty, v_line.sales_order_id::text, 'Manual Line Revert');
        
        v_total_unreserved := v_total_unreserved + v_loc_record.reserved_qty;
    END LOOP;

    -- Update Status
    PERFORM update_sales_order_status_after_allocation(v_line.sales_order_id);

    RETURN json_build_object('success', true, 'unreserved', v_total_unreserved);
END;
$$;
