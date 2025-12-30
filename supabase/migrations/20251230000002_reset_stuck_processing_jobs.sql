-- Reset all stuck processing jobs to pending
-- This is a one-time fix for jobs that got stuck

UPDATE sync_queue
SET 
  status = 'pending',
  started_at = NULL,
  last_heartbeat = NULL,
  error_message = COALESCE(error_message, '') || ' [Manual reset: was stuck in processing]'
WHERE status = 'processing';

-- Also grant execute on reset function to authenticated users
GRANT EXECUTE ON FUNCTION reset_stale_sync_jobs() TO authenticated;
GRANT EXECUTE ON FUNCTION reset_stale_sync_jobs() TO anon;

