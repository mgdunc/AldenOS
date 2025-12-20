-- Fix RLS policy for integrations table to allow development access
-- In production, you should restrict this to authenticated admins only.

DROP POLICY IF EXISTS "Admins can manage integrations" ON integrations;

CREATE POLICY "Enable access for all users" ON integrations
FOR ALL
USING (true)
WITH CHECK (true);
