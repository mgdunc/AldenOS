-- Add supplier_sku to product_inventory_view for search functionality
DROP VIEW IF EXISTS product_inventory_view;

CREATE VIEW product_inventory_view AS
SELECT 
    p.id AS product_id,
    p.sku,
    p.name,
    p.description,
    p.barcode,
    p.supplier_sku,
    p.cost_price,
    p.retail_price,
    p.list_price,
    p.compare_at_price,
    p.product_type,
    p.vendor,
    p.status,
    p.carton_qty,
    p.image_url,
    COALESCE(inv.qoh, 0) AS qoh,
    COALESCE(inv.reserved, 0) AS reserved,
    COALESCE(inv.available, 0) AS available,
    COALESCE(inv.on_order, 0) AS on_order,
    COALESCE(demand.total_demand, 0) AS demand,
    GREATEST(0, COALESCE(demand.total_demand, 0) - COALESCE(inv.available, 0) - COALESCE(inv.on_order, 0)) AS net_required,
    CASE 
        WHEN COALESCE(demand.total_demand, 0) > (COALESCE(inv.available, 0) + COALESCE(inv.on_order, 0)) 
        THEN COALESCE(demand.total_demand, 0) - (COALESCE(inv.available, 0) + COALESCE(inv.on_order, 0))
        ELSE 0 
    END AS backlog,
    COALESCE(supplier_stock.quantity, 0) AS supplier_available,
    supplier_stock.stock_date AS supplier_stock_date
FROM products p
LEFT JOIN (
    SELECT 
        product_id,
        SUM(qoh) AS qoh,
        SUM(reserved) AS reserved,
        SUM(available) AS available,
        SUM(on_order) AS on_order
    FROM inventory_snapshots
    GROUP BY product_id
) inv ON inv.product_id = p.id
LEFT JOIN (
    SELECT 
        sol.product_id,
        SUM(sol.quantity_ordered - COALESCE(sol.quantity_fulfilled, 0)) AS total_demand
    FROM sales_order_lines sol
    JOIN sales_orders so ON so.id = sol.sales_order_id
    WHERE so.is_open = true
    GROUP BY sol.product_id
) demand ON demand.product_id = p.id
LEFT JOIN LATERAL (
    SELECT ssl.quantity, ssl.stock_date
    FROM supplier_stock_levels ssl
    WHERE ssl.product_id = p.id
    ORDER BY ssl.stock_date DESC
    LIMIT 1
) supplier_stock ON true;

COMMENT ON VIEW product_inventory_view IS 'Consolidated product inventory view with supplier SKU and barcode for search';
