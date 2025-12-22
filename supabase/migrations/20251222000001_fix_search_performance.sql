-- Enable pg_trgm for better text search performance
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Add GIN indexes for fast ILIKE searches
CREATE INDEX IF NOT EXISTS idx_products_name_trgm ON products USING gin (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_products_sku_trgm ON products USING gin (sku gin_trgm_ops);

-- Add missing index on inventory_snapshots to speed up view joins
CREATE INDEX IF NOT EXISTS idx_snapshots_product_id ON inventory_snapshots(product_id);
