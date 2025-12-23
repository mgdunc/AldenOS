-- Create sync_queue table for managing background sync jobs
CREATE TABLE IF NOT EXISTS sync_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    integration_id UUID NOT NULL REFERENCES integrations(id) ON DELETE CASCADE,
    sync_type TEXT NOT NULL CHECK (sync_type IN ('product_sync', 'order_sync', 'inventory_sync')),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'cancelled')),
    priority INTEGER NOT NULL DEFAULT 3 CHECK (priority BETWEEN 1 AND 5),
    retry_count INTEGER NOT NULL DEFAULT 0,
    max_retries INTEGER NOT NULL DEFAULT 3,
    error_message TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Add indexes for performance
CREATE INDEX idx_sync_queue_status ON sync_queue(status) WHERE status IN ('pending', 'processing');
CREATE INDEX idx_sync_queue_integration ON sync_queue(integration_id);
CREATE INDEX idx_sync_queue_created ON sync_queue(created_at DESC);
CREATE INDEX idx_sync_queue_priority ON sync_queue(priority DESC, created_at ASC) WHERE status = 'pending';

-- Add queue_id to integration_sync_jobs
ALTER TABLE integration_sync_jobs 
ADD COLUMN IF NOT EXISTS queue_id UUID REFERENCES sync_queue(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_sync_jobs_queue ON integration_sync_jobs(queue_id);

-- Enable RLS
ALTER TABLE sync_queue ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view sync queue for integrations they have access to
CREATE POLICY "Users can view sync queue"
    ON sync_queue FOR SELECT
    USING (true);

-- Policy: Users can insert sync queue entries
CREATE POLICY "Users can create sync queue entries"
    ON sync_queue FOR INSERT
    WITH CHECK (true);

-- Policy: Users can update their own sync queue entries
CREATE POLICY "Users can update sync queue entries"
    ON sync_queue FOR UPDATE
    USING (true);

-- Policy: Users can delete their own sync queue entries
CREATE POLICY "Users can delete sync queue entries"
    ON sync_queue FOR DELETE
    USING (true);

-- Add helpful comment
COMMENT ON TABLE sync_queue IS 'Queue for managing background synchronization jobs from external integrations';
COMMENT ON COLUMN sync_queue.priority IS '1 = Highest priority, 5 = Lowest priority';
COMMENT ON COLUMN sync_queue.metadata IS 'Additional sync parameters (filters, page size, etc.)';
