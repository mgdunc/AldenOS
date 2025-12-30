-- Add missing Shopify address fields to sales_orders table
-- Reference: https://shopify.dev/docs/api/admin-rest/2024-10/resources/order

-- Shipping Address - Additional Fields
ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS shipping_first_name TEXT;
ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS shipping_last_name TEXT;
ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS shipping_company TEXT;
ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS shipping_province_code TEXT;
ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS shipping_country_code TEXT;
ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS shipping_latitude DECIMAL(10, 8);
ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS shipping_longitude DECIMAL(11, 8);

-- Billing Address - Additional Fields
ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS billing_first_name TEXT;
ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS billing_last_name TEXT;
ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS billing_company TEXT;
ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS billing_province_code TEXT;
ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS billing_country_code TEXT;
ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS billing_latitude DECIMAL(10, 8);
ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS billing_longitude DECIMAL(11, 8);

-- Add comments for documentation
COMMENT ON COLUMN sales_orders.shipping_first_name IS 'Shopify: First name of recipient';
COMMENT ON COLUMN sales_orders.shipping_last_name IS 'Shopify: Last name of recipient';
COMMENT ON COLUMN sales_orders.shipping_company IS 'Shopify: Company name';
COMMENT ON COLUMN sales_orders.shipping_province_code IS 'Shopify: 2-letter state/province code';
COMMENT ON COLUMN sales_orders.shipping_country_code IS 'Shopify: 2-letter ISO country code';
COMMENT ON COLUMN sales_orders.shipping_latitude IS 'Shopify: Latitude coordinate';
COMMENT ON COLUMN sales_orders.shipping_longitude IS 'Shopify: Longitude coordinate';

COMMENT ON COLUMN sales_orders.billing_first_name IS 'Shopify: First name on billing';
COMMENT ON COLUMN sales_orders.billing_last_name IS 'Shopify: Last name on billing';
COMMENT ON COLUMN sales_orders.billing_company IS 'Shopify: Company name';
COMMENT ON COLUMN sales_orders.billing_province_code IS 'Shopify: 2-letter state/province code';
COMMENT ON COLUMN sales_orders.billing_country_code IS 'Shopify: 2-letter ISO country code';
COMMENT ON COLUMN sales_orders.billing_latitude IS 'Shopify: Latitude coordinate';
COMMENT ON COLUMN sales_orders.billing_longitude IS 'Shopify: Longitude coordinate';

