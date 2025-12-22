ALTER TABLE products ADD COLUMN IF NOT EXISTS retail_price numeric(10,2);

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
    p.retail_price,
    p.product_type,
    p.vendor,
    p.image_url,
    
    COALESCE(SUM(s.qoh), 0) AS qoh,
    COALESCE(SUM(s.reserved), 0) AS reserved,

    COALESCE((
        SELECT SUM(pol.quantity_ordered - pol.quantity_received)
        FROM purchase_order_lines pol
        JOIN purchase_orders po ON pol.purchase_order_id = po.id
        WHERE pol.product_id = p.id
        AND po.status IN ('placed', 'partial')
    ), 0) AS on_order,

    (COALESCE(SUM(s.qoh), 0) - COALESCE(SUM(s.reserved), 0)) AS available,

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
