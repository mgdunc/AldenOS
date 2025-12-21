-- Ensure the image_url column exists
ALTER TABLE products ADD COLUMN IF NOT EXISTS image_url TEXT;

-- Recreate the product_inventory_view with image_url
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
    p.compare_at_price,
    p.product_type,
    p.vendor,
    p.image_url,
    
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
                AND so.is_open = true
            ), 0) - COALESCE(SUM(s.qoh), 0)
        ) > 0 THEN (
            COALESCE((
                SELECT SUM(sol.quantity_ordered - sol.quantity_fulfilled)
                FROM sales_order_lines sol
                JOIN sales_orders so ON sol.sales_order_id = so.id
                WHERE sol.product_id = p.id
                AND so.is_open = true
            ), 0) - COALESCE(SUM(s.qoh), 0)
        )
        ELSE 0
    END AS net_required,

    -- Demand: Sum of all open sales order line quantities (quantity_ordered - quantity_fulfilled)
    COALESCE((
        SELECT SUM(sol.quantity_ordered - sol.quantity_fulfilled)
        FROM sales_order_lines sol
        JOIN sales_orders so ON sol.sales_order_id = so.id
        WHERE sol.product_id = p.id
        AND so.is_open = true
    ), 0) AS demand

FROM products p
LEFT JOIN inventory_snapshots s ON p.id = s.product_id
GROUP BY p.id;
