-- Fetch the last 5 system logs to debug the failure
DO $$
DECLARE
    r record;
BEGIN
    RAISE NOTICE '--- RECENT LOGS ---';
    FOR r IN SELECT * FROM system_logs ORDER BY created_at DESC LIMIT 5 LOOP
        RAISE NOTICE 'Level: %, Msg: %, Details: %', r.level, r.message, r.details;
    END LOOP;
    RAISE NOTICE '-------------------';
END;
$$;
