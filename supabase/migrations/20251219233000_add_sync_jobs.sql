-- Create integration_sync_jobs table
CREATE TABLE IF NOT EXISTS integration_sync_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    integration_type TEXT NOT NULL, -- 'shopify', etc.
    status TEXT NOT NULL DEFAULT 'pending', -- pending, running, completed, failed, cancelled
    total_items INT DEFAULT 0,
    processed_items INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    completed_at TIMESTAMPTZ,
    error_message TEXT,
    metadata JSONB DEFAULT '{}'::jsonb
);

-- Enable RLS
ALTER TABLE integration_sync_jobs ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Allow read access to authenticated users" ON integration_sync_jobs
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow insert access to authenticated users" ON integration_sync_jobs
    FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Allow update access to authenticated users" ON integration_sync_jobs
    FOR UPDATE TO authenticated USING (true);

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE integration_sync_jobs;
