-- Add supplier_sku column to products table
-- This stores the SKU used by the supplier for this product

ALTER TABLE products
ADD COLUMN IF NOT EXISTS supplier_sku TEXT;

-- Add comment for documentation
COMMENT ON COLUMN products.supplier_sku IS 'The SKU/part number used by the supplier for this product';

-- Create index for lookups by supplier_sku
CREATE INDEX IF NOT EXISTS idx_products_supplier_sku ON products(supplier_sku) WHERE supplier_sku IS NOT NULL;

