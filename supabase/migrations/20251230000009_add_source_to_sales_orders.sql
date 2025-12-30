-- Add source field to track where orders came from
ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'manual';

-- Add shopify_order_number for display purposes
ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS shopify_order_number TEXT;

-- Update existing orders: if they have a shopify_order_id, set source to 'shopify'
UPDATE sales_orders 
SET source = 'shopify' 
WHERE shopify_order_id IS NOT NULL AND source = 'manual';

-- Add index for source filtering
CREATE INDEX IF NOT EXISTS idx_sales_orders_source ON sales_orders(source);

-- Add comments
COMMENT ON COLUMN sales_orders.source IS 'Order source: manual, shopify, api, etc.';
COMMENT ON COLUMN sales_orders.shopify_order_number IS 'Shopify order number (e.g. #1001) for display';

