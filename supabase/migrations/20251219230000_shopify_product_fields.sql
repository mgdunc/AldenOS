-- Add more Shopify mapping fields to products
ALTER TABLE products ADD COLUMN IF NOT EXISTS shopify_product_id BIGINT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS shopify_variant_id BIGINT;

-- Index for faster lookups during sync
CREATE INDEX IF NOT EXISTS idx_products_sku ON products(sku);
