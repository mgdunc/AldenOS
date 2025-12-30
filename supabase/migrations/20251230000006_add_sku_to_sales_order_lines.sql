-- Add SKU and Shopify fields to sales_order_lines
-- This allows tracking the SKU even if product is deleted, and links to Shopify line items

-- Add SKU column (stores the SKU at time of order for historical reference)
ALTER TABLE sales_order_lines ADD COLUMN IF NOT EXISTS sku TEXT;

-- Add Shopify-specific fields
ALTER TABLE sales_order_lines ADD COLUMN IF NOT EXISTS shopify_line_item_id TEXT;
ALTER TABLE sales_order_lines ADD COLUMN IF NOT EXISTS shopify_variant_id TEXT;
ALTER TABLE sales_order_lines ADD COLUMN IF NOT EXISTS shopify_product_id TEXT;

-- Add product name for historical reference (in case product is deleted)
ALTER TABLE sales_order_lines ADD COLUMN IF NOT EXISTS product_name TEXT;

-- Make product_id nullable (for unmatched Shopify products)
ALTER TABLE sales_order_lines ALTER COLUMN product_id DROP NOT NULL;

-- Add index for Shopify lookups
CREATE INDEX IF NOT EXISTS idx_sales_order_lines_shopify_line_item_id 
ON sales_order_lines(shopify_line_item_id);

CREATE INDEX IF NOT EXISTS idx_sales_order_lines_sku 
ON sales_order_lines(sku);

-- Populate SKU from existing products
UPDATE sales_order_lines sol
SET sku = p.sku,
    product_name = p.name
FROM products p
WHERE sol.product_id = p.id
AND sol.sku IS NULL;

-- Add comments
COMMENT ON COLUMN sales_order_lines.sku IS 'Product SKU at time of order (historical reference)';
COMMENT ON COLUMN sales_order_lines.product_name IS 'Product name at time of order (historical reference)';
COMMENT ON COLUMN sales_order_lines.shopify_line_item_id IS 'Shopify line_item.id for sync tracking';
COMMENT ON COLUMN sales_order_lines.shopify_variant_id IS 'Shopify variant_id from line item';
COMMENT ON COLUMN sales_order_lines.shopify_product_id IS 'Shopify product_id from line item';

