-- Fix: Ensure update_sales_order_status_after_allocation handles nulls and edge cases
CREATE OR REPLACE FUNCTION "public"."update_sales_order_status_after_allocation"("p_order_id" "uuid") 
RETURNS "void"
LANGUAGE "plpgsql"
AS $$
DECLARE
    v_total_ordered int;
    v_total_allocated int;
    v_total_fulfilled int;
    v_current_status text;
BEGIN
    -- Get Current Status
    SELECT status INTO v_current_status FROM sales_orders WHERE id = p_order_id;
    
    -- Ignore if Cancelled or Draft or Completed
    IF v_current_status IN ('cancelled', 'draft', 'completed') THEN RETURN; END IF;

    -- Calculate Totals
    SELECT 
        COALESCE(SUM(quantity_ordered), 0),
        COALESCE(SUM(quantity_allocated), 0),
        COALESCE(SUM(quantity_fulfilled), 0)
    INTO v_total_ordered, v_total_allocated, v_total_fulfilled
    FROM sales_order_lines 
    WHERE sales_order_id = p_order_id;

    -- Determine Status
    IF v_total_ordered = 0 THEN RETURN; END IF;

    IF v_total_allocated >= (v_total_ordered - v_total_fulfilled) THEN
        -- Everything needed is allocated (or already fulfilled)
        UPDATE sales_orders SET status = 'reserved' WHERE id = p_order_id;
    ELSIF v_total_allocated > 0 THEN
        -- Some allocated
        UPDATE sales_orders SET status = 'awaiting_stock' WHERE id = p_order_id; -- Or 'partially_allocated' if you prefer
    ELSE
        -- Nothing allocated
        -- If we were 'reserved', go back to 'confirmed'
        IF v_current_status = 'reserved' THEN
            UPDATE sales_orders SET status = 'confirmed' WHERE id = p_order_id;
        END IF;
    END IF;
END;
$$;
