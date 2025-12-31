-- Fix system_logs table RLS and access

-- Enable RLS on system_logs
ALTER TABLE system_logs ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any
DROP POLICY IF EXISTS "Users can read system logs" ON system_logs;
DROP POLICY IF EXISTS "Users can insert system logs" ON system_logs;
DROP POLICY IF EXISTS "Service role full access to system logs" ON system_logs;

-- Allow authenticated users to read all logs
CREATE POLICY "Users can read system logs" ON system_logs
  FOR SELECT TO authenticated USING (true);

-- Allow authenticated users to insert logs
CREATE POLICY "Users can insert system logs" ON system_logs
  FOR INSERT TO authenticated WITH CHECK (true);

-- Allow service role full access
CREATE POLICY "Service role full access to system logs" ON system_logs
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Ensure grants are in place
GRANT SELECT, INSERT ON system_logs TO authenticated;
GRANT ALL ON system_logs TO service_role;

