-- Fix RLS for import_jobs
ALTER TABLE import_jobs ENABLE ROW LEVEL SECURITY;

-- Drop existing policy to avoid conflicts
DROP POLICY IF EXISTS "Enable all access for authenticated users" ON import_jobs;

-- Create a permissive policy for authenticated users
CREATE POLICY "Enable all access for authenticated users"
ON import_jobs
FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

-- Auto-assign user_id on insert
ALTER TABLE import_jobs ALTER COLUMN user_id SET DEFAULT auth.uid();
