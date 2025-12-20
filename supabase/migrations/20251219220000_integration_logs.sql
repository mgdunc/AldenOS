-- Create integration_logs table
CREATE TABLE IF NOT EXISTS integration_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    integration_id UUID REFERENCES integrations(id) ON DELETE CASCADE,
    level TEXT DEFAULT 'info', -- 'info', 'warning', 'error', 'success'
    event_type TEXT, -- 'webhook_received', 'order_sync', 'inventory_sync'
    message TEXT,
    details JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE integration_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow read access to authenticated users" ON integration_logs
FOR SELECT USING (auth.role() = 'authenticated');

-- Allow insert from service role (Edge Functions) or authenticated users (for testing)
CREATE POLICY "Allow insert access to authenticated users" ON integration_logs
FOR INSERT WITH CHECK (auth.role() = 'authenticated');
