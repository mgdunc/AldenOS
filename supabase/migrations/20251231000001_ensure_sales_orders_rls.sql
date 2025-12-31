-- Ensure RLS is enabled on sales_orders and has proper policies
-- This fixes the issue where queries return 0 rows even though data exists

-- Enable RLS if not already enabled
ALTER TABLE sales_orders ENABLE ROW LEVEL SECURITY;

-- Drop existing policy if it exists (to recreate it)
DROP POLICY IF EXISTS "Enable full access for authenticated users on sales_orders" ON sales_orders;

-- Create comprehensive RLS policies for sales_orders
CREATE POLICY "Enable full access for authenticated users on sales_orders" 
ON sales_orders 
TO authenticated 
USING (true) 
WITH CHECK (true);

-- Also ensure sales_order_lines has RLS enabled
ALTER TABLE sales_order_lines ENABLE ROW LEVEL SECURITY;

-- Drop and recreate policy for sales_order_lines
DROP POLICY IF EXISTS "Enable full access for authenticated users on sales_order_lines" ON sales_order_lines;

CREATE POLICY "Enable full access for authenticated users on sales_order_lines" 
ON sales_order_lines 
TO authenticated 
USING (true) 
WITH CHECK (true);

