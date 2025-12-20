-- 1. Create Notes Table (Polymorphic Pattern)
CREATE TABLE IF NOT EXISTS notes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ DEFAULT now(),
    user_id UUID REFERENCES auth.users(id),
    content TEXT NOT NULL, -- HTML content from Tiptap
    
    -- Polymorphic Foreign Keys
    product_id UUID REFERENCES products(id),
    sales_order_id UUID REFERENCES sales_orders(id),
    purchase_order_id UUID REFERENCES purchase_orders(id),
    
    -- Constraint: Exactly one parent must be set
    CONSTRAINT one_parent_only CHECK (
        (product_id IS NOT NULL)::int +
        (sales_order_id IS NOT NULL)::int +
        (purchase_order_id IS NOT NULL)::int = 1
    )
);

-- Enable RLS
ALTER TABLE notes ENABLE ROW LEVEL SECURITY;

-- Policy: Everyone can read/write notes (for now, internal tool)
CREATE POLICY "Enable all access for authenticated users" ON notes
    FOR ALL USING (auth.role() = 'authenticated');

-- 2. Create Unified Timeline View
-- This view combines "System Events" (Ledger) and "Human Events" (Notes)
CREATE OR REPLACE VIEW timeline_events AS
    -- 1. Notes (Human)
    SELECT 
        id::text as id,
        created_at,
        'note' as type,
        'chat' as category, -- 'chat' or 'system'
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
        NULL as user_id, -- Ledger doesn't track user yet
        product_id as entity_id,
        'product' as entity_type
    FROM inventory_ledger

    UNION ALL

    -- 3. Inventory Ledger (System - Order Context)
    -- We project ledger entries that reference an Order ID
    SELECT 
        id::text as id,
        created_at,
        transaction_type as type,
        'system' as category,
        'Product ' || (SELECT sku FROM products WHERE id = inventory_ledger.product_id) || ': ' || COALESCE(notes, 'System Transaction') as description,
        NULL as user_id,
        reference_id::uuid as entity_id, -- Cast text reference to UUID
        'sales_order' as entity_type
    FROM inventory_ledger
    WHERE transaction_type IN ('reserved', 'picking', 'shipped', 'cancelled', 'unreserved') 
      AND reference_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' -- Only valid UUIDs

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
      AND reference_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'; -- Only valid UUIDs
