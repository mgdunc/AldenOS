-- Verify and fix RLS on sales_orders
-- Check current RLS status and policies

-- First, let's see what the current state is
DO $$
BEGIN
    -- Check if RLS is enabled
    IF EXISTS (
        SELECT 1 FROM pg_tables 
        WHERE schemaname = 'public' 
        AND tablename = 'sales_orders'
        AND rowsecurity = false
    ) THEN
        RAISE NOTICE 'RLS is NOT enabled on sales_orders - enabling now';
        ALTER TABLE sales_orders ENABLE ROW LEVEL SECURITY;
    ELSE
        RAISE NOTICE 'RLS is already enabled on sales_orders';
    END IF;
END $$;

-- Drop all existing policies to start fresh
DROP POLICY IF EXISTS "Enable full access for authenticated users on sales_orders" ON sales_orders;
DROP POLICY IF EXISTS "Enable read access for authenticated users" ON sales_orders;
DROP POLICY IF EXISTS "Enable insert for authenticated users" ON sales_orders;
DROP POLICY IF EXISTS "Enable update for authenticated users" ON sales_orders;
DROP POLICY IF EXISTS "Enable delete for authenticated users" ON sales_orders;

-- Create a comprehensive policy that allows all operations for authenticated users
CREATE POLICY "sales_orders_authenticated_all" 
ON sales_orders 
FOR ALL 
TO authenticated 
USING (true) 
WITH CHECK (true);

-- Also ensure sales_order_lines has proper RLS
ALTER TABLE sales_order_lines ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Enable full access for authenticated users on sales_order_lines" ON sales_order_lines;
DROP POLICY IF EXISTS "sales_order_lines_authenticated_all" ON sales_order_lines;

CREATE POLICY "sales_order_lines_authenticated_all" 
ON sales_order_lines 
FOR ALL 
TO authenticated 
USING (true) 
WITH CHECK (true);

-- Verify RLS is enabled
DO $$
DECLARE
    rls_enabled boolean;
BEGIN
    SELECT rowsecurity INTO rls_enabled
    FROM pg_tables
    WHERE schemaname = 'public' AND tablename = 'sales_orders';
    
    IF rls_enabled THEN
        RAISE NOTICE 'SUCCESS: RLS is enabled on sales_orders';
    ELSE
        RAISE WARNING 'WARNING: RLS is still not enabled on sales_orders';
    END IF;
END $$;

