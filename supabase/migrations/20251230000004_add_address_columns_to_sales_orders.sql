-- Add individual address columns to sales_orders table
-- This replaces the JSONB address fields with proper columns

-- Shipping Address Fields
ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS shipping_name TEXT;
ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS shipping_address1 TEXT;
ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS shipping_address2 TEXT;
ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS shipping_city TEXT;
ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS shipping_province TEXT;
ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS shipping_zip TEXT;
ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS shipping_country TEXT;
ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS shipping_phone TEXT;

-- Billing Address Fields
ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS billing_name TEXT;
ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS billing_address1 TEXT;
ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS billing_address2 TEXT;
ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS billing_city TEXT;
ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS billing_province TEXT;
ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS billing_zip TEXT;
ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS billing_country TEXT;
ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS billing_phone TEXT;

-- Migrate existing JSON data to new columns (if shipping_address is JSONB)
DO $$
BEGIN
  -- Check if shipping_address is jsonb type before migrating
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'sales_orders' 
    AND column_name = 'shipping_address' 
    AND data_type = 'jsonb'
  ) THEN
    UPDATE sales_orders
    SET 
      shipping_name = shipping_address->>'name',
      shipping_address1 = shipping_address->>'address1',
      shipping_address2 = shipping_address->>'address2',
      shipping_city = shipping_address->>'city',
      shipping_province = shipping_address->>'province',
      shipping_zip = shipping_address->>'zip',
      shipping_country = shipping_address->>'country',
      shipping_phone = shipping_address->>'phone'
    WHERE shipping_address IS NOT NULL;
  END IF;

  -- Check if billing_address is jsonb type before migrating
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'sales_orders' 
    AND column_name = 'billing_address' 
    AND data_type = 'jsonb'
  ) THEN
    UPDATE sales_orders
    SET 
      billing_name = billing_address->>'name',
      billing_address1 = billing_address->>'address1',
      billing_address2 = billing_address->>'address2',
      billing_city = billing_address->>'city',
      billing_province = billing_address->>'province',
      billing_zip = billing_address->>'zip',
      billing_country = billing_address->>'country',
      billing_phone = billing_address->>'phone'
    WHERE billing_address IS NOT NULL;
  END IF;
END $$;

-- Add comments
COMMENT ON COLUMN sales_orders.shipping_name IS 'Recipient name for shipping';
COMMENT ON COLUMN sales_orders.shipping_address1 IS 'Shipping street address line 1';
COMMENT ON COLUMN sales_orders.shipping_address2 IS 'Shipping street address line 2';
COMMENT ON COLUMN sales_orders.shipping_city IS 'Shipping city';
COMMENT ON COLUMN sales_orders.shipping_province IS 'Shipping state/province';
COMMENT ON COLUMN sales_orders.shipping_zip IS 'Shipping postal/zip code';
COMMENT ON COLUMN sales_orders.shipping_country IS 'Shipping country';
COMMENT ON COLUMN sales_orders.shipping_phone IS 'Shipping contact phone';

COMMENT ON COLUMN sales_orders.billing_name IS 'Billing name';
COMMENT ON COLUMN sales_orders.billing_address1 IS 'Billing street address line 1';
COMMENT ON COLUMN sales_orders.billing_address2 IS 'Billing street address line 2';
COMMENT ON COLUMN sales_orders.billing_city IS 'Billing city';
COMMENT ON COLUMN sales_orders.billing_province IS 'Billing state/province';
COMMENT ON COLUMN sales_orders.billing_zip IS 'Billing postal/zip code';
COMMENT ON COLUMN sales_orders.billing_country IS 'Billing country';
COMMENT ON COLUMN sales_orders.billing_phone IS 'Billing contact phone';

