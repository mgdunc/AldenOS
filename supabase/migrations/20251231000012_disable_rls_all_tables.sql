-- Disable Row Level Security on all application tables
-- This removes access control restrictions for simpler development/operation

-- Core Tables
ALTER TABLE IF EXISTS products DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS inventory_snapshots DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS inventory_ledger DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS locations DISABLE ROW LEVEL SECURITY;

-- Sales
ALTER TABLE IF EXISTS sales_orders DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS sales_order_lines DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS customers DISABLE ROW LEVEL SECURITY;

-- Purchasing
ALTER TABLE IF EXISTS purchase_orders DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS purchase_order_lines DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS suppliers DISABLE ROW LEVEL SECURITY;

-- Communication & Notes
ALTER TABLE IF EXISTS notes DISABLE ROW LEVEL SECURITY;

-- Import/Export
ALTER TABLE IF EXISTS import_jobs DISABLE ROW LEVEL SECURITY;

-- Integrations
ALTER TABLE IF EXISTS integrations DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS integration_logs DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS integration_sync_jobs DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS integration_unmatched_products DISABLE ROW LEVEL SECURITY;

-- Sync
ALTER TABLE IF EXISTS sync_queue DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS sync_logs DISABLE ROW LEVEL SECURITY;

-- Supplier Stock
ALTER TABLE IF EXISTS supplier_stock_uploads DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS supplier_stock_levels DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS supplier_stock_unmatched DISABLE ROW LEVEL SECURITY;

-- System
ALTER TABLE IF EXISTS system_logs DISABLE ROW LEVEL SECURITY;

-- User Profiles (keep RLS on this for security, or disable if you prefer)
-- Uncomment the line below to disable RLS on profiles too:
ALTER TABLE IF EXISTS profiles DISABLE ROW LEVEL SECURITY;

-- Grant full access to authenticated users on all tables
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA public TO authenticated;

-- Grant full access to anon users (for public access if needed)
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO anon;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO anon;

