-- Update timeline_events view to include sync events for orders
-- This allows order sync updates to appear in the order timeline

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

-- Add comment
COMMENT ON VIEW timeline_events IS 'Unified timeline combining notes, ledger entries, and sync events';

