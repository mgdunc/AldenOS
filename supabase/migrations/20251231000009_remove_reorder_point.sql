-- Remove reorder_point column and update related views/functions

-- 1. Update product_inventory_view to remove reorder_point
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
    ), 0) AS demand,

    -- Include supplier stock if available
    (
        SELECT ssl.quantity 
        FROM supplier_stock_levels ssl 
        WHERE ssl.product_id = p.id 
        ORDER BY ssl.stock_date DESC 
        LIMIT 1
    ) AS supplier_available,
    
    (
        SELECT ssl.stock_date 
        FROM supplier_stock_levels ssl 
        WHERE ssl.product_id = p.id 
        ORDER BY ssl.stock_date DESC 
        LIMIT 1
    ) AS supplier_stock_date

FROM products p
LEFT JOIN inventory_snapshots s ON p.id = s.product_id
GROUP BY p.id;

-- 2. Update get_product_stats to remove reorder_point reference
-- Now uses available <= 10 as a basic threshold for "low stock" instead
CREATE OR REPLACE FUNCTION get_product_stats()
RETURNS json
LANGUAGE sql
STABLE
AS $$
  SELECT json_build_object(
    'total_products', (SELECT count(*) FROM products),
    'active_products', (SELECT count(*) FROM products WHERE status = 'active'),
    'low_stock', (SELECT count(*) FROM product_inventory_view WHERE available > 0 AND available <= 10 AND status = 'active'),
    'out_of_stock', (SELECT count(*) FROM product_inventory_view WHERE available <= 0 AND status = 'active'),
    'total_valuation', (SELECT COALESCE(sum(qoh * cost_price), 0) FROM product_inventory_view)
  );
$$;

-- 3. Drop the reorder_point column from products table
ALTER TABLE products DROP COLUMN IF EXISTS reorder_point;

-- Add comment
COMMENT ON VIEW product_inventory_view IS 'Product inventory view with stock levels, demand, and supplier stock';

