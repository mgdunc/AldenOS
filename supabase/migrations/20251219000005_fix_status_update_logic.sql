-- Fix: Update update_sales_order_status_after_allocation to handle 'reserved' correctly
CREATE OR REPLACE FUNCTION "public"."update_sales_order_status_after_allocation"("p_order_id" "uuid") RETURNS "void"
LANGUAGE "plpgsql"
AS $$
DECLARE
    v_fully_allocated boolean := true;
    v_line record;
BEGIN
    -- Check if ALL lines are fully allocated
    FOR v_line IN SELECT * FROM sales_order_lines WHERE sales_order_id = p_order_id LOOP
        -- If Allocated + Fulfilled < Ordered, then it's not fully allocated
        IF (COALESCE(v_line.quantity_allocated, 0) + COALESCE(v_line.quantity_fulfilled, 0)) < v_line.quantity_ordered THEN
            v_fully_allocated := false;
            EXIT;
        END IF;
    END LOOP;

    IF v_fully_allocated THEN
        UPDATE sales_orders SET status = 'reserved' WHERE id = p_order_id;
    ELSE
        -- If not fully allocated, it might be 'awaiting_stock' or 'confirmed'
        -- If we have SOME allocation, maybe 'confirmed'? 
        -- Let's stick to 'awaiting_stock' if we are short, or 'confirmed' if we just started.
        -- Actually, if we are short, 'awaiting_stock' is the most descriptive.
        UPDATE sales_orders SET status = 'awaiting_stock' WHERE id = p_order_id;
    END IF;
END;
$$;
