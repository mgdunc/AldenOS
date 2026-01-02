-- Restore system_logs and sync_logs tables (they are actively used!)
-- Previous migration incorrectly dropped them

-- 1. Recreate system_logs table (used by logger.ts and error handlers)
CREATE TABLE IF NOT EXISTS system_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    level TEXT NOT NULL CHECK (level IN ('INFO', 'WARN', 'ERROR', 'DEBUG')),
    source TEXT NOT NULL,
    message TEXT NOT NULL,
    details JSONB,
    user_id UUID DEFAULT auth.uid()
);

-- Grant access
GRANT ALL ON TABLE system_logs TO authenticated;
GRANT ALL ON TABLE system_logs TO service_role;

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_system_logs_created_at ON system_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_system_logs_level ON system_logs(level);

-- 2. Recreate sync_logs table (used by timeline_events view)
-- NOTE: Removed foreign keys to deleted tables (integrations, sync_queue)
CREATE TABLE IF NOT EXISTS sync_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  function_name TEXT NOT NULL,
  level TEXT NOT NULL CHECK (level IN ('debug', 'info', 'warn', 'error')),
  message TEXT NOT NULL,
  details JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_sync_logs_created_at ON sync_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sync_logs_function_name ON sync_logs(function_name);

-- Enable RLS
ALTER TABLE sync_logs ENABLE ROW LEVEL SECURITY;

-- Policies
DROP POLICY IF EXISTS "Users can read sync logs" ON sync_logs;
CREATE POLICY "Users can read sync logs" ON sync_logs
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Service role can insert sync logs" ON sync_logs;
CREATE POLICY "Service role can insert sync logs" ON sync_logs
  FOR INSERT TO service_role WITH CHECK (true);

-- Grant permissions
GRANT SELECT ON sync_logs TO authenticated;
GRANT ALL ON sync_logs TO service_role;

-- 3. Recreate timeline_events view
CREATE OR REPLACE VIEW timeline_events AS
    -- 1. Notes (Human)
    SELECT 
        id::text as id,
        created_at,
        'note' as type,
        'chat' as category,
        content as description,
        user_id,
        COALESCE(product_id, sales_order_id, purchase_order_id) as entity_id,
        CASE 
            WHEN product_id IS NOT NULL THEN 'product'
            WHEN sales_order_id IS NOT NULL THEN 'sales_order'
            WHEN purchase_order_id IS NOT NULL THEN 'purchase_order'
        END as entity_type
    FROM notes

    UNION ALL

    -- 2. Inventory Ledger (System - Product Context)
    SELECT 
        id::text as id,
        created_at,
        transaction_type as type,
        'system' as category,
        COALESCE(notes, 'System Transaction') || ' (Qty: ' || COALESCE(change_qoh, change_reserved, 0)::text || ')' as description,
        NULL as user_id,
        product_id as entity_id,
        'product' as entity_type
    FROM inventory_ledger

    UNION ALL

    -- 3. Inventory Ledger (System - Order Context)
    SELECT 
        id::text as id,
        created_at,
        transaction_type as type,
        'system' as category,
        'Product ' || (SELECT sku FROM products WHERE id = inventory_ledger.product_id) || ': ' || COALESCE(notes, 'System Transaction') as description,
        NULL as user_id,
        reference_id::uuid as entity_id,
        'sales_order' as entity_type
    FROM inventory_ledger
    WHERE transaction_type IN ('reserved', 'picking', 'shipped', 'cancelled', 'unreserved') 
      AND reference_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'

    UNION ALL

    -- 4. Inventory Ledger (System - PO Context)
    SELECT 
        id::text as id,
        created_at,
        transaction_type as type,
        'system' as category,
        'Product ' || (SELECT sku FROM products WHERE id = inventory_ledger.product_id) || ': ' || COALESCE(notes, 'System Transaction') as description,
        NULL as user_id,
        reference_id::uuid as entity_id,
        'purchase_order' as entity_type
    FROM inventory_ledger
    WHERE transaction_type IN ('purchase', 'po_received')
      AND reference_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'

    UNION ALL

    -- 5. Sync Logs (System - Order Sync Events from Shopify)
    -- Shows when orders were imported/updated from Shopify
    SELECT 
        sl.id::text as id,
        sl.created_at,
        'sync' as type,
        'system' as category,
        CASE sl.level
            WHEN 'info' THEN '🔄 ' || sl.message
            WHEN 'warn' THEN '⚠️ ' || sl.message
            WHEN 'error' THEN '❌ ' || sl.message
            ELSE sl.message
        END as description,
        NULL::uuid as user_id,
        so.id as entity_id,
        'sales_order' as entity_type
    FROM sync_logs sl
    JOIN sales_orders so ON so.shopify_order_id = (sl.details->>'shopifyOrderId')::bigint
    WHERE sl.function_name LIKE 'shopify-order%'
      AND sl.details->>'shopifyOrderId' IS NOT NULL
      AND so.id IS NOT NULL;

-- Add comments
COMMENT ON TABLE system_logs IS 'Application error and system logs (used by logger.ts)';
COMMENT ON TABLE sync_logs IS 'Sync operation logs from Edge Functions (simplified - no FK to deleted tables)';
COMMENT ON VIEW timeline_events IS 'Unified timeline combining notes, ledger entries, and sync events';
