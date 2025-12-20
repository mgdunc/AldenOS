-- Run repro again 5
DO $$
DECLARE
    v_prod uuid;
    v_loc uuid;
BEGIN
    -- 1. Create dummy product/location
    INSERT INTO products (sku, name, status) VALUES ('TEST-SKU-5', 'Test Product 5', 'active') RETURNING id INTO v_prod;
    INSERT INTO locations (name, is_sellable) VALUES ('TEST-LOC-5', true) RETURNING id INTO v_loc;

    -- 2. Seed Snapshot
    INSERT INTO inventory_snapshots (product_id, location_id, qoh, reserved) VALUES (v_prod, v_loc, 10, 3);

    -- 3. Insert Ledger Entry
    INSERT INTO inventory_ledger (product_id, location_id, transaction_type, change_reserved, notes)
    VALUES (v_prod, v_loc, 'unreserved', -3, 'Test Unreserve');

    RAISE NOTICE 'Success!';
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'FAILED: %', SQLERRM;
END;
$$;
