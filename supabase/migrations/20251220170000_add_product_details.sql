-- Add additional product details
ALTER TABLE products ADD COLUMN IF NOT EXISTS compare_at_price numeric(10,2);
ALTER TABLE products ADD COLUMN IF NOT EXISTS product_type text;
ALTER TABLE products ADD COLUMN IF NOT EXISTS vendor text;
