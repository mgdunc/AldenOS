-- View to see inventory by location and product
CREATE OR REPLACE VIEW location_inventory_view AS
SELECT 
    l.id as location_id,
    l.name as location_name,
    p.id as product_id,
    p.sku,
    p.name as product_name,
    COALESCE(SUM(il.change_qoh), 0) as quantity
FROM locations l
CROSS JOIN products p
LEFT JOIN inventory_ledger il ON il.location_id = l.id AND il.product_id = p.id
GROUP BY l.id, l.name, p.id, p.sku, p.name
HAVING COALESCE(SUM(il.change_qoh), 0) != 0;
