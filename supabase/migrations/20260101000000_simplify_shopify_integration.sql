-- Simplify Shopify Integration: Single Store, No Queue
-- Drop all multi-store and queue complexity

-- 1. Drop old complex tables
DROP TABLE IF EXISTS integration_unmatched_products CASCADE;
DROP TABLE IF EXISTS integration_logs CASCADE;
DROP TABLE IF EXISTS integration_sync_jobs CASCADE;
DROP TABLE IF EXISTS sync_queue CASCADE;
DROP TABLE IF EXISTS stock_commitments CASCADE;
DROP TABLE IF EXISTS integrations CASCADE;

-- 2. Create simplified sync tracking table
CREATE TABLE IF NOT EXISTS shopify_syncs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sync_type TEXT NOT NULL CHECK (sync_type IN ('products', 'orders')),
  status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed')),
  
  -- Counters
  total_items INT DEFAULT 0,
  processed_items INT DEFAULT 0,
  created_count INT DEFAULT 0,
  updated_count INT DEFAULT 0,
  error_count INT DEFAULT 0,
  
  -- Progress tracking
  current_page INT DEFAULT 1,
  progress_pct INT DEFAULT 0,
  
  -- Timing
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  
  -- Error info
  error_message TEXT,
  
  -- Metadata for debugging
  metadata JSONB DEFAULT '{}'::jsonb
);

-- Index for performance
CREATE INDEX idx_shopify_syncs_type_status ON shopify_syncs(sync_type, status);
CREATE INDEX idx_shopify_syncs_started ON shopify_syncs(started_at DESC);

-- Enable RLS
ALTER TABLE shopify_syncs ENABLE ROW LEVEL SECURITY;

-- Policy: Authenticated users can read all syncs
CREATE POLICY "Authenticated users can view syncs"
  ON shopify_syncs FOR SELECT
  TO authenticated
  USING (true);

-- Policy: Service role can manage syncs
CREATE POLICY "Service role can manage syncs"
  ON shopify_syncs FOR ALL
  TO service_role
  USING (true);

-- Enable Realtime for live progress updates
ALTER PUBLICATION supabase_realtime ADD TABLE shopify_syncs;

-- 3. Ensure product columns exist for Shopify linkage
ALTER TABLE products 
  ADD COLUMN IF NOT EXISTS shopify_product_id BIGINT,
  ADD COLUMN IF NOT EXISTS shopify_variant_id BIGINT,
  ADD COLUMN IF NOT EXISTS shopify_inventory_item_id BIGINT;

-- Create indexes for Shopify product lookups
CREATE INDEX IF NOT EXISTS idx_products_shopify_product ON products(shopify_product_id) WHERE shopify_product_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_products_shopify_variant ON products(shopify_variant_id) WHERE shopify_variant_id IS NOT NULL;

-- 4. Ensure sales_orders columns exist for Shopify linkage
ALTER TABLE sales_orders 
  ADD COLUMN IF NOT EXISTS shopify_order_id BIGINT,
  ADD COLUMN IF NOT EXISTS shopify_order_number TEXT;

-- Create unique constraint and index
CREATE UNIQUE INDEX IF NOT EXISTS idx_sales_orders_shopify_order ON sales_orders(shopify_order_id) WHERE shopify_order_id IS NOT NULL;

-- 5. Add vendor column to products if missing (for Shopify vendor)
ALTER TABLE products ADD COLUMN IF NOT EXISTS vendor TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS weight NUMERIC(10,2);
ALTER TABLE products ADD COLUMN IF NOT EXISTS weight_unit TEXT;

-- 6. Clean up any orphaned data from old system
-- (No data to clean since we're dropping the tables)

COMMENT ON TABLE shopify_syncs IS 'Simplified Shopify sync tracking for single-store integration. Uses environment variables for credentials.';
COMMENT ON COLUMN shopify_syncs.sync_type IS 'Type of sync: products or orders';
COMMENT ON COLUMN shopify_syncs.progress_pct IS 'Real-time progress percentage (0-100) for UI updates';
