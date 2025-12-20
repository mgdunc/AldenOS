-- List triggers on inventory_snapshots
DO $$
DECLARE
    r record;
BEGIN
    RAISE NOTICE '--- TRIGGERS ON inventory_snapshots ---';
    FOR r IN 
        SELECT tgname, tgtype 
        FROM pg_trigger 
        WHERE tgrelid = 'public.inventory_snapshots'::regclass
    LOOP
        RAISE NOTICE 'Trigger: %, Type: %', r.tgname, r.tgtype;
    END LOOP;
    RAISE NOTICE '---------------------------------------';
END;
$$;
