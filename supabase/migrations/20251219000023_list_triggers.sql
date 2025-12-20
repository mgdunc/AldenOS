-- List all triggers on inventory_ledger
DO $$
DECLARE
    r record;
BEGIN
    RAISE NOTICE '--- TRIGGERS ON inventory_ledger ---';
    FOR r IN 
        SELECT tgname, tgtype 
        FROM pg_trigger 
        WHERE tgrelid = 'public.inventory_ledger'::regclass
    LOOP
        RAISE NOTICE 'Trigger: %, Type: %', r.tgname, r.tgtype;
    END LOOP;
    RAISE NOTICE '------------------------------------';
END;
$$;
