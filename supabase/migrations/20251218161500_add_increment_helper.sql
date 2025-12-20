-- Helper function to increment received quantity on a PO line
CREATE OR REPLACE FUNCTION "public"."increment_po_line_received"("p_line_id" "uuid", "p_qty" integer) RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    UPDATE purchase_order_lines
    SET quantity_received = COALESCE(quantity_received, 0) + p_qty
    WHERE id = p_line_id;
END;
$$;
