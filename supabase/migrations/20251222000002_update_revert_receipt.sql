CREATE OR REPLACE FUNCTION "public"."revert_inventory_receipt"("p_receipt_id" "uuid") RETURNS void
    LANGUAGE "plpgsql"
    AS $$
DECLARE
    line RECORD;
    v_po_id uuid;
    v_total_ordered int;
    v_total_received int;
BEGIN
    -- 1. Validation (Check if we have enough stock to revert)
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

    -- Get PO ID before we delete lines (via receipt)
    SELECT purchase_order_id INTO v_po_id FROM inventory_receipts WHERE id = p_receipt_id;

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
        WHERE pol.purchase_order_id = v_po_id 
        AND pol.product_id = line.product_id;
    END LOOP;

    -- 3. Mark the receipt as cancelled/deleted
    -- We delete the lines to remove the record of items being received
    DELETE FROM inventory_receipt_lines WHERE receipt_id = p_receipt_id;
    
    -- Mark receipt as reverted
    UPDATE inventory_receipts SET notes = COALESCE(notes, '') || ' [REVERTED]' WHERE id = p_receipt_id;

    -- 4. Update PO Status
    -- Calculate totals
    SELECT 
        COALESCE(SUM(quantity_ordered), 0), 
        COALESCE(SUM(quantity_received), 0)
    INTO v_total_ordered, v_total_received
    FROM purchase_order_lines
    WHERE purchase_order_id = v_po_id;

    IF v_total_received = 0 THEN
        UPDATE purchase_orders SET status = 'placed' WHERE id = v_po_id;
    ELSIF v_total_received < v_total_ordered THEN
        UPDATE purchase_orders SET status = 'partial_received' WHERE id = v_po_id;
    ELSE
        -- Should not happen if we just reverted, but just in case
        UPDATE purchase_orders SET status = 'received' WHERE id = v_po_id;
    END IF;

END;
$$;
