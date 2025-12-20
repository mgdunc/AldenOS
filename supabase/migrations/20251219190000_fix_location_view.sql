-- Optimize location_inventory_view to avoid expensive CROSS JOIN
CREATE OR REPLACE VIEW location_inventory_view AS
SELECT 
    il.location_id,
    l.name as location_name,
    il.product_id,
    p.sku,
    p.name as product_name,
    SUM(il.change_qoh) as quantity
FROM inventory_ledger il
JOIN locations l ON il.location_id = l.id
JOIN products p ON il.product_id = p.id
GROUP BY il.location_id, l.name, il.product_id, p.sku, p.name
HAVING SUM(il.change_qoh) != 0;
