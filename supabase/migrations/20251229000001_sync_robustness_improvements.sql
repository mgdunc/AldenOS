-- Add robustness improvements to sync system

-- 1. Add last_heartbeat column for stale job detection
ALTER TABLE sync_queue 
ADD COLUMN IF NOT EXISTS last_heartbeat TIMESTAMPTZ;

-- 2. Add checkpoint column for resumable syncs
ALTER TABLE sync_queue 
ADD COLUMN IF NOT EXISTS checkpoint JSONB DEFAULT '{}';

-- 3. Add error_type for better error classification
ALTER TABLE sync_queue 
ADD COLUMN IF NOT EXISTS error_type TEXT CHECK (error_type IN ('retryable', 'permanent', 'unknown'));

-- 4. Create function to detect and reset stale jobs
-- Jobs processing for more than 10 minutes without heartbeat are considered stale
CREATE OR REPLACE FUNCTION reset_stale_sync_jobs()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  stale_count INTEGER;
BEGIN
  WITH stale_jobs AS (
    UPDATE sync_queue
    SET 
      status = CASE 
        WHEN retry_count < max_retries THEN 'pending'
        ELSE 'failed'
      END,
      retry_count = retry_count + 1,
      error_message = COALESCE(error_message, '') || ' [Auto-reset: job became stale after 10 minutes]',
      error_type = 'retryable',
      started_at = NULL,
      last_heartbeat = NULL
    WHERE status = 'processing'
      AND (
        last_heartbeat < NOW() - INTERVAL '10 minutes'
        OR (last_heartbeat IS NULL AND started_at < NOW() - INTERVAL '10 minutes')
      )
    RETURNING id
  )
  SELECT COUNT(*) INTO stale_count FROM stale_jobs;
  
  RETURN stale_count;
END;
$$;

-- 5. Create function to get sync health stats
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

-- 6. Index for efficient stale job detection
CREATE INDEX IF NOT EXISTS idx_sync_queue_stale_detection 
ON sync_queue(status, last_heartbeat, started_at) 
WHERE status = 'processing';

-- 7. Index for health stats queries
CREATE INDEX IF NOT EXISTS idx_sync_queue_health_stats 
ON sync_queue(integration_id, status, created_at DESC);
