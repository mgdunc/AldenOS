-- Drop unused tables that were created but never referenced in application code
-- These tables exist in the database but have no active queries/usage

-- Drop sync_logs (created but never used in src/)
DROP TABLE IF EXISTS sync_logs CASCADE;

-- Drop system_logs (created but never used in src/)
DROP TABLE IF EXISTS system_logs CASCADE;

-- Drop product_integrations (created but never used in src/)
DROP TABLE IF EXISTS product_integrations CASCADE;

COMMENT ON SCHEMA public IS 'Cleaned up unused tables from Shopify integration simplification';
