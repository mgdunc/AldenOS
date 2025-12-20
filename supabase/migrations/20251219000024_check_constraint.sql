-- Check constraint definition
DO $$
DECLARE
    r record;
BEGIN
    RAISE NOTICE '--- CONSTRAINTS ---';
    FOR r IN 
        SELECT constraint_name, check_clause 
        FROM information_schema.check_constraints 
        WHERE constraint_name = 'inventory_snapshots_reserved_check'
    LOOP
        RAISE NOTICE 'Constraint: %, Clause: %', r.constraint_name, r.check_clause;
    END LOOP;
    RAISE NOTICE '-------------------';
END;
$$;
