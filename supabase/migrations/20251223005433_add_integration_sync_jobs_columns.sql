-- Add missing columns to integration_sync_jobs table
ALTER TABLE integration_sync_jobs 
  ADD COLUMN IF NOT EXISTS integration_id UUID REFERENCES integrations(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS job_type TEXT NOT NULL DEFAULT 'product_sync';

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_integration_sync_jobs_integration_id 
  ON integration_sync_jobs(integration_id);

CREATE INDEX IF NOT EXISTS idx_integration_sync_jobs_job_type 
  ON integration_sync_jobs(job_type);

CREATE INDEX IF NOT EXISTS idx_integration_sync_jobs_status 
  ON integration_sync_jobs(status);
