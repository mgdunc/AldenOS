-- Add credentials table for UI-based Shopify configuration
CREATE TABLE IF NOT EXISTS shopify_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_url TEXT NOT NULL,
  access_token TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Only allow one active configuration
  CONSTRAINT single_active_config UNIQUE (is_active)
);

-- Enable RLS for security
ALTER TABLE shopify_credentials ENABLE ROW LEVEL SECURITY;

-- Only authenticated users can manage credentials
CREATE POLICY "Authenticated users can manage credentials"
  ON shopify_credentials FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

COMMENT ON TABLE shopify_credentials IS 'Stores Shopify API credentials. Prioritized over environment variables in shopify-config.ts';
