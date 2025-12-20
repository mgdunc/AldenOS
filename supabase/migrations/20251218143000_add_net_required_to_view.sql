-- Update product_inventory_view to include list_price and net_required
-- Also ensures status checks are consistent

DROP VIEW IF EXISTS "public"."product_inventory_view";

CREATE OR REPLACE VIEW "public"."product_inventory_view" AS
SELECT
    p.id AS product_id,
    p.sku,
    p.name,
    p.reorder_point,
    p.list_price,
    p.price_cost,
    
    -- QOH: Sum of all snapshots
    COALESCE(SUM(s.qoh), 0) AS qoh,
    
    -- Reserved (Demand): Sum of all unfulfilled sales order lines
    COALESCE((
        SELECT SUM(sol.quantity_ordered - sol.quantity_fulfilled)
        FROM sales_order_lines sol
        JOIN sales_orders so ON sol.sales_order_id = so.id
        WHERE sol.product_id = p.id
        AND so.status IN ('confirmed', 'reserved', 'awaiting_stock', 'picking', 'partially_shipped')
    ), 0) AS reserved,

    -- On Order: Sum of all unreceived purchase order lines
    COALESCE((
        SELECT SUM(pol.quantity_ordered - pol.quantity_received)
        FROM purchase_order_lines pol
        JOIN purchase_orders po ON pol.purchase_order_id = po.id
        WHERE pol.product_id = p.id
        AND po.status IN ('placed', 'partial')
    ), 0) AS on_order,

    -- Available: QOH - Demand
    (COALESCE(SUM(s.qoh), 0) - COALESCE((
        SELECT SUM(sol.quantity_ordered - sol.quantity_fulfilled)
        FROM sales_order_lines sol
        JOIN sales_orders so ON sol.sales_order_id = so.id
        WHERE sol.product_id = p.id
        AND so.status IN ('confirmed', 'reserved', 'awaiting_stock', 'picking', 'partially_shipped')
    ), 0)) AS available,

    -- Net Required: Positive number if Available is negative (Shortage)
    CASE 
        WHEN (COALESCE(SUM(s.qoh), 0) - COALESCE((
            SELECT SUM(sol.quantity_ordered - sol.quantity_fulfilled)
            FROM sales_order_lines sol
            JOIN sales_orders so ON sol.sales_order_id = so.id
            WHERE sol.product_id = p.id
            AND so.status IN ('confirmed', 'reserved', 'awaiting_stock', 'picking', 'partially_shipped')
        ), 0)) < 0 
        THEN ABS(COALESCE(SUM(s.qoh), 0) - COALESCE((
            SELECT SUM(sol.quantity_ordered - sol.quantity_fulfilled)
            FROM sales_order_lines sol
            JOIN sales_orders so ON sol.sales_order_id = so.id
            WHERE sol.product_id = p.id
            AND so.status IN ('confirmed', 'reserved', 'awaiting_stock', 'picking', 'partially_shipped')
        ), 0))
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
