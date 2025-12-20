-- Securely expose user info for mentions
CREATE OR REPLACE VIEW profiles_view AS
SELECT 
    id,
    email,
    raw_user_meta_data->>'full_name' as full_name
FROM auth.users;

GRANT SELECT ON profiles_view TO authenticated;
