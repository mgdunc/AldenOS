-- Add order_date column to sales_orders
-- This stores the original order date (e.g., from Shopify)
-- as opposed to created_at which is when the record was created in our system

ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS order_date TIMESTAMPTZ;

-- For existing orders, default to created_at if no order_date is set
UPDATE sales_orders 
SET order_date = created_at 
WHERE order_date IS NULL;

-- Add index for sorting/filtering by order_date
CREATE INDEX IF NOT EXISTS idx_sales_orders_order_date ON sales_orders(order_date);

COMMENT ON COLUMN sales_orders.order_date IS 'Original order date (e.g., from Shopify). Falls back to created_at for manual orders.';

