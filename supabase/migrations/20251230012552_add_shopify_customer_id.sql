-- Add Shopify customer ID to customers table for order sync
ALTER TABLE customers ADD COLUMN IF NOT EXISTS shopify_customer_id BIGINT UNIQUE;

-- Index for faster lookups during sync
CREATE INDEX IF NOT EXISTS idx_customers_shopify_customer_id ON customers(shopify_customer_id);
