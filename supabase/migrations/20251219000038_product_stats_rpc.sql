-- Helper function for dashboard stats
CREATE OR REPLACE FUNCTION get_product_stats()
RETURNS json
LANGUAGE sql
STABLE
AS $$
  SELECT json_build_object(
    'total_products', (SELECT count(*) FROM products),
    'active_products', (SELECT count(*) FROM products WHERE status = 'active'),
    'low_stock', (SELECT count(*) FROM product_inventory_view WHERE available <= reorder_point AND status = 'active'),
    'out_of_stock', (SELECT count(*) FROM product_inventory_view WHERE available <= 0 AND status = 'active'),
    'total_valuation', (SELECT COALESCE(sum(qoh * cost_price), 0) FROM product_inventory_view)
  );
$$;
