-- Fix: allocate_inventory_and_confirm_order
-- Logic Update: Only reserve what is physically available.
-- If an order needs 10 but we only have 4, we reserve 4.
-- The remaining 6 are "Backordered" (Demand) but NOT "Reserved" (Physical Hold).

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

            -- Create Ledger Entry (Trigger will update snapshot.reserved)
            INSERT INTO inventory_ledger (product_id, location_id, transaction_type, change_reserved, reference_id, notes)
            VALUES (v_line.product_id, v_bin.location_id, 'reserved', v_qty_to_take, p_order_id, 'Order Allocation');

            -- Calculate Remaining Need
            v_qty_needed := v_qty_needed - v_qty_to_take;

            -- Stop looking if we found enough for this line
            EXIT WHEN v_qty_needed <= 0;
        END LOOP;

        -- If we checked all bins and STILL need items, the order is Short.
        -- CRITICAL CHANGE: We do NOT reserve the missing amount.
        -- The missing amount remains as "Demand" (Quantity Ordered) but is not "Physically Reserved".
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

-- Update the View to correctly calculate "Reserved" vs "Backlog"
-- "Reserved" = Physical Hold (Sum of snapshots.reserved)
-- "Demand" = Commercial Commitment (Sum of Order Lines)
-- "Backlog" = Demand - Reserved

DROP VIEW IF EXISTS "public"."product_inventory_view";

CREATE OR REPLACE VIEW "public"."product_inventory_view" AS
SELECT
    p.id AS product_id,
    p.id,
    p.sku,
    p.name,
    p.description,
    p.status,
    p.barcode,
    p.carton_qty,
    p.reorder_point,
    p.list_price,
    p.price_cost,
    p.cost_price,
    
    -- QOH: Sum of all snapshots
    COALESCE(SUM(s.qoh), 0) AS qoh,
    
    -- Reserved (Physical): Sum of all snapshots reserved
    -- This is the "Hard Allocation"
    COALESCE(SUM(s.reserved), 0) AS reserved,

    -- On Order: Sum of all unreceived purchase order lines
    COALESCE((
        SELECT SUM(pol.quantity_ordered - pol.quantity_received)
        FROM purchase_order_lines pol
        JOIN purchase_orders po ON pol.purchase_order_id = po.id
        WHERE pol.product_id = p.id
        AND po.status IN ('placed', 'partial')
    ), 0) AS on_order,

    -- Available: QOH - Reserved (Physical)
    -- This is what is left to sell
    (COALESCE(SUM(s.qoh), 0) - COALESCE(SUM(s.reserved), 0)) AS available,

    -- Net Required: (Total Demand - Total Physical Stock)
    -- If we have orders for 10, but only 4 in stock (and reserved), we need 6 more.
    CASE 
        WHEN (
            COALESCE((
                SELECT SUM(sol.quantity_ordered - sol.quantity_fulfilled)
                FROM sales_order_lines sol
                JOIN sales_orders so ON sol.sales_order_id = so.id
                WHERE sol.product_id = p.id
                AND so.status IN ('confirmed', 'reserved', 'awaiting_stock', 'picking', 'partially_shipped')
            ), 0) - COALESCE(SUM(s.qoh), 0)
        ) > 0 
        THEN (
            COALESCE((
                SELECT SUM(sol.quantity_ordered - sol.quantity_fulfilled)
                FROM sales_order_lines sol
                JOIN sales_orders so ON sol.sales_order_id = so.id
                WHERE sol.product_id = p.id
                AND so.status IN ('confirmed', 'reserved', 'awaiting_stock', 'picking', 'partially_shipped')
            ), 0) - COALESCE(SUM(s.qoh), 0)
        )
        ELSE 0
    END AS net_required,

    -- Backlog: Count of orders that are waiting
    (
        SELECT COUNT(DISTINCT so.id)
        FROM sales_order_lines sol
        JOIN sales_orders so ON sol.sales_order_id = so.id
        WHERE sol.product_id = p.id
        AND so.status IN ('confirmed', 'reserved', 'awaiting_stock')
        AND (sol.quantity_ordered - sol.quantity_fulfilled) > 0
    ) as backlog

FROM products p
LEFT JOIN inventory_snapshots s ON p.id = s.product_id
GROUP BY p.id;
