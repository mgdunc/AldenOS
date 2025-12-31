-- Fix RLS policy issue - the policy exists but isn't working
-- This will drop all policies and recreate them properly

-- First, let's see what policies exist
DO $$
DECLARE
    policy_count integer;
BEGIN
    SELECT COUNT(*) INTO policy_count
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'sales_orders';
    
    RAISE NOTICE 'Found % existing policies on sales_orders', policy_count;
END $$;

-- Drop ALL existing policies on sales_orders
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN 
        SELECT policyname 
        FROM pg_policies 
        WHERE schemaname = 'public' AND tablename = 'sales_orders'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON sales_orders', r.policyname);
        RAISE NOTICE 'Dropped policy: %', r.policyname;
    END LOOP;
END $$;

-- Ensure RLS is enabled
ALTER TABLE sales_orders ENABLE ROW LEVEL SECURITY;

-- Create a simple, explicit policy for SELECT
CREATE POLICY "sales_orders_select_authenticated" 
ON sales_orders 
FOR SELECT 
TO authenticated 
USING (true);

-- Create policy for INSERT
CREATE POLICY "sales_orders_insert_authenticated" 
ON sales_orders 
FOR INSERT 
TO authenticated 
WITH CHECK (true);

-- Create policy for UPDATE
CREATE POLICY "sales_orders_update_authenticated" 
ON sales_orders 
FOR UPDATE 
TO authenticated 
USING (true) 
WITH CHECK (true);

-- Create policy for DELETE
CREATE POLICY "sales_orders_delete_authenticated" 
ON sales_orders 
FOR DELETE 
TO authenticated 
USING (true);

-- Do the same for sales_order_lines
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN 
        SELECT policyname 
        FROM pg_policies 
        WHERE schemaname = 'public' AND tablename = 'sales_order_lines'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON sales_order_lines', r.policyname);
        RAISE NOTICE 'Dropped policy: %', r.policyname;
    END LOOP;
END $$;

ALTER TABLE sales_order_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sales_order_lines_select_authenticated" 
ON sales_order_lines 
FOR SELECT 
TO authenticated 
USING (true);

CREATE POLICY "sales_order_lines_insert_authenticated" 
ON sales_order_lines 
FOR INSERT 
TO authenticated 
WITH CHECK (true);

CREATE POLICY "sales_order_lines_update_authenticated" 
ON sales_order_lines 
FOR UPDATE 
TO authenticated 
USING (true) 
WITH CHECK (true);

CREATE POLICY "sales_order_lines_delete_authenticated" 
ON sales_order_lines 
FOR DELETE 
TO authenticated 
USING (true);

-- Verify policies were created
DO $$
DECLARE
    policy_count integer;
BEGIN
    SELECT COUNT(*) INTO policy_count
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'sales_orders';
    
    RAISE NOTICE 'Created % policies on sales_orders', policy_count;
    
    IF policy_count < 4 THEN
        RAISE WARNING 'Expected 4 policies but found %', policy_count;
    END IF;
END $$;

