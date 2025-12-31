-- Replace functional unique index with proper NULLS NOT DISTINCT constraint
-- This is the correct PostgreSQL 15+ way to handle NULL values in unique constraints
-- It treats NULL values as equal, allowing only one NULL supplier_id per product/date

-- Drop the workaround functional index
DROP INDEX IF EXISTS supplier_stock_levels_product_date_unique;

-- Add a proper unique constraint with NULLS NOT DISTINCT
-- This allows the application to use standard upsert with onConflict
ALTER TABLE supplier_stock_levels
ADD CONSTRAINT supplier_stock_levels_product_supplier_date_unique
UNIQUE NULLS NOT DISTINCT (product_id, supplier_id, stock_date);

COMMENT ON CONSTRAINT supplier_stock_levels_product_supplier_date_unique ON supplier_stock_levels IS
'Ensures only one stock level per product per supplier per date. NULLS NOT DISTINCT treats NULL supplier_id values as equal.';
