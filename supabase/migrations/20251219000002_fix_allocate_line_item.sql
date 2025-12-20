-- Fix: Update allocate_line_item to support Idempotency and Quantity Allocated
CREATE OR REPLACE FUNCTION "public"."allocate_line_item"(
    "p_line_id" "uuid",
    "p_idempotency_key" "uuid" DEFAULT NULL
) RETURNS json
LANGUAGE "plpgsql"
AS $$
DECLARE
    v_line record;
    v_bin record;
    v_qty_needed int;
    v_qty_to_take int;
    v_allocated_now int := 0;
    v_first_entry boolean := true;
BEGIN
    -- Idempotency Check
    IF p_idempotency_key IS NOT NULL AND EXISTS (SELECT 1 FROM inventory_ledger WHERE idempotency_key = p_idempotency_key) THEN
        RETURN json_build_object('success', true, 'message', 'Idempotent skip');
    END IF;

    -- Get Line Details
    SELECT * INTO v_line FROM sales_order_lines WHERE id = p_line_id;
    
    -- Calculate Needed using the new column
    v_qty_needed := v_line.quantity_ordered - COALESCE(v_line.quantity_fulfilled, 0) - COALESCE(v_line.quantity_allocated, 0);

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

        INSERT INTO inventory_ledger (
            product_id, location_id, transaction_type, change_reserved, reference_id, notes, idempotency_key
        )
        VALUES (
            v_line.product_id, v_bin.location_id, 'reserved', v_qty_to_take, v_line.sales_order_id::text, 'Manual Line Allocation',
            CASE WHEN v_first_entry THEN p_idempotency_key ELSE NULL END
        );
        
        v_first_entry := false;
        v_allocated_now := v_allocated_now + v_qty_to_take;
        v_qty_needed := v_qty_needed - v_qty_to_take;

        EXIT WHEN v_qty_needed <= 0;
    END LOOP;

    -- Update Line Allocation
    IF v_allocated_now > 0 THEN
        UPDATE sales_order_lines 
        SET quantity_allocated = quantity_allocated + v_allocated_now
        WHERE id = p_line_id;
    END IF;

    -- Update Order Status
    PERFORM update_sales_order_status_after_allocation(v_line.sales_order_id);

    RETURN json_build_object('success', true, 'allocated', v_allocated_now);
END;
$$;
