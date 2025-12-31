-- Fix supplier_stock_levels unique constraint to properly handle NULL supplier_id
-- By default, PostgreSQL treats NULL values as distinct in unique constraints
-- This migration ensures only ONE stock level per product per date, even when supplier_id is NULL

-- Step 1: Remove duplicate records, keeping only the most recent one
-- For each combination of (product_id, stock_date, supplier_id), keep the one with the latest created_at
DELETE FROM supplier_stock_levels
WHERE id IN (
    SELECT id
    FROM (
        SELECT 
            id,
            ROW_NUMBER() OVER (
                PARTITION BY product_id, stock_date, COALESCE(supplier_id, '00000000-0000-0000-0000-000000000000'::uuid)
                ORDER BY created_at DESC
            ) as rn
        FROM supplier_stock_levels
    ) sub
    WHERE rn > 1
);

-- Step 2: Drop the existing unique constraint
ALTER TABLE supplier_stock_levels DROP CONSTRAINT IF EXISTS supplier_stock_levels_product_id_supplier_id_stock_date_key;

-- Step 3: Create a unique index that treats NULL supplier_id values as equal
-- This ensures only one record per product per date when supplier_id is NULL
CREATE UNIQUE INDEX supplier_stock_levels_product_date_unique 
ON supplier_stock_levels (product_id, stock_date, COALESCE(supplier_id, '00000000-0000-0000-0000-000000000000'::uuid));

COMMENT ON INDEX supplier_stock_levels_product_date_unique IS 
'Ensures only one stock level per product per date, treating NULL supplier_id as a single value';
