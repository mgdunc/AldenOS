-- Fix: Ensure get_sync_health_stats function exists
-- This migration ensures the function is created even if the previous migration didn't apply correctly

-- Drop and recreate to ensure it's correct
DROP FUNCTION IF EXISTS get_sync_health_stats(UUID);

CREATE OR REPLACE FUNCTION get_sync_health_stats(p_integration_id UUID DEFAULT NULL)
RETURNS TABLE (
  integration_id UUID,
  total_syncs BIGINT,
  successful_syncs BIGINT,
  failed_syncs BIGINT,
  success_rate NUMERIC,
  avg_duration_seconds NUMERIC,
  last_successful_sync TIMESTAMPTZ,
  last_failed_sync TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT 
    sq.integration_id,
    COUNT(*) as total_syncs,
    COUNT(*) FILTER (WHERE sq.status = 'completed') as successful_syncs,
    COUNT(*) FILTER (WHERE sq.status = 'failed') as failed_syncs,
    ROUND(
      COUNT(*) FILTER (WHERE sq.status = 'completed')::NUMERIC / 
      NULLIF(COUNT(*) FILTER (WHERE sq.status IN ('completed', 'failed')), 0) * 100, 
      1
    ) as success_rate,
    ROUND(
      AVG(EXTRACT(EPOCH FROM (sq.completed_at - sq.started_at))) 
      FILTER (WHERE sq.status = 'completed'),
      1
    ) as avg_duration_seconds,
    MAX(sq.completed_at) FILTER (WHERE sq.status = 'completed') as last_successful_sync,
    MAX(sq.completed_at) FILTER (WHERE sq.status = 'failed') as last_failed_sync
  FROM sync_queue sq
  WHERE (p_integration_id IS NULL OR sq.integration_id = p_integration_id)
    AND sq.created_at > NOW() - INTERVAL '30 days'
  GROUP BY sq.integration_id;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION get_sync_health_stats(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_sync_health_stats(UUID) TO anon;

