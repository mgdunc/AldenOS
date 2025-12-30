-- Create a dedicated table for sync operation logs
-- This captures detailed progress from Edge Functions

CREATE TABLE IF NOT EXISTS sync_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  queue_id UUID REFERENCES sync_queue(id) ON DELETE CASCADE,
  integration_id UUID REFERENCES integrations(id) ON DELETE CASCADE,
  function_name TEXT NOT NULL,
  level TEXT NOT NULL CHECK (level IN ('debug', 'info', 'warn', 'error')),
  message TEXT NOT NULL,
  details JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for efficient querying
CREATE INDEX idx_sync_logs_queue_id ON sync_logs(queue_id);
CREATE INDEX idx_sync_logs_integration_id ON sync_logs(integration_id);
CREATE INDEX idx_sync_logs_created_at ON sync_logs(created_at DESC);
CREATE INDEX idx_sync_logs_function_name ON sync_logs(function_name);

-- Enable RLS
ALTER TABLE sync_logs ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read sync logs
CREATE POLICY "Users can read sync logs" ON sync_logs
  FOR SELECT TO authenticated USING (true);

-- Allow service role to insert
CREATE POLICY "Service role can insert sync logs" ON sync_logs
  FOR INSERT TO service_role WITH CHECK (true);

-- Grant permissions
GRANT SELECT ON sync_logs TO authenticated;
GRANT ALL ON sync_logs TO service_role;

-- Comment
COMMENT ON TABLE sync_logs IS 'Detailed logs from Edge Function sync operations';

