-- Create a test function to check sales_orders access
-- This will help us debug the RLS issue

CREATE OR REPLACE FUNCTION test_sales_orders_count()
RETURNS TABLE(count bigint, sample_ids uuid[]) 
LANGUAGE plpgsql
SECURITY DEFINER -- Runs with creator's privileges (bypasses RLS)
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    COUNT(*)::bigint as count,
    ARRAY_AGG(id) FILTER (WHERE id IS NOT NULL) as sample_ids
  FROM sales_orders
  LIMIT 10;
END;
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION test_sales_orders_count() TO authenticated;

-- Also create a function that returns actual rows (for testing)
CREATE OR REPLACE FUNCTION test_sales_orders_rows()
RETURNS TABLE(
  id uuid,
  order_number text,
  status text,
  customer_name text,
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    so.id,
    so.order_number,
    so.status,
    so.customer_name,
    so.created_at
  FROM sales_orders so
  ORDER BY so.created_at DESC
  LIMIT 10;
END;
$$;

GRANT EXECUTE ON FUNCTION test_sales_orders_rows() TO authenticated;

