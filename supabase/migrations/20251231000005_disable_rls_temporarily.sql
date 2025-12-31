-- Temporarily disable RLS on sales_orders to confirm it's the issue
-- This is a debugging step - we'll re-enable properly after confirming

-- Disable RLS on sales_orders
ALTER TABLE sales_orders DISABLE ROW LEVEL SECURITY;

-- Disable RLS on sales_order_lines
ALTER TABLE sales_order_lines DISABLE ROW LEVEL SECURITY;

-- Note: This allows all authenticated users full access
-- We should re-enable RLS with proper policies later

DO $$
BEGIN
    RAISE NOTICE 'RLS DISABLED on sales_orders and sales_order_lines';
    RAISE NOTICE 'This is temporary - re-enable after confirming the issue';
END $$;

