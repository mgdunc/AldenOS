-- 1. Add Shopify fields
ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS shopify_order_id BIGINT UNIQUE;
ALTER TABLE products ADD COLUMN IF NOT EXISTS shopify_inventory_item_id BIGINT;

-- 2. Create stock_commitments table (as requested)
CREATE TABLE IF NOT EXISTS stock_commitments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sales_order_id UUID REFERENCES sales_orders(id),
    product_id UUID REFERENCES products(id),
    quantity INT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    status TEXT DEFAULT 'active' -- active, fulfilled, cancelled
);

-- 3. Create Integrations table for settings
CREATE TABLE IF NOT EXISTS integrations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider TEXT NOT NULL UNIQUE, -- 'shopify'
    settings JSONB DEFAULT '{}'::jsonb,
    is_active BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE integrations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can manage integrations" ON integrations FOR ALL USING (auth.role() = 'authenticated'); -- Simplified for now

-- 4. Trigger for Outbound Fulfillment
-- We'll use a simple function that can be hooked up to pg_net or just log for now if pg_net isn't setup.
-- Ideally, we use Supabase Database Webhooks, but here is a placeholder function.

CREATE OR REPLACE FUNCTION notify_shopify_fulfillment()
RETURNS TRIGGER AS $$
BEGIN
    -- In a real scenario, we would use pg_net.http_post here to call the Edge Function
    -- PERFORMS: POST to edge-function-url with payload { fulfillment_id: NEW.id }
    
    -- For now, we'll just log it, as the Edge Function URL is dynamic/env-dependent
    RAISE NOTICE 'Fulfillment Created: %', NEW.id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_notify_shopify_fulfillment
AFTER INSERT ON fulfillments
FOR EACH ROW
EXECUTE FUNCTION notify_shopify_fulfillment();
