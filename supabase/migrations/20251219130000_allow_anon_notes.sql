-- Allow anonymous access to notes for development
CREATE POLICY "Enable all access for anon users" ON notes
    FOR ALL
    TO anon
    USING (true)
    WITH CHECK (true);
