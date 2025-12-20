BEGIN;

-- Plan the number of tests
SELECT plan(6);

-- 1. Setup Test Data
-- We use fixed UUIDs to make the test deterministic
INSERT INTO public.locations (id, name, is_sellable) 
VALUES ('00000000-0000-0000-0000-000000000001', 'Test Location', true);

INSERT INTO public.products (id, sku, name, status, cost_price, list_price) 
VALUES ('00000000-0000-0000-0000-000000000002', 'TEST-SKU-001', 'Test Product', 'active', 10, 20);

-- 2. Test: book_in_stock (Basic Success)
SELECT lives_ok(
  $$ SELECT book_in_stock(
       '00000000-0000-0000-0000-000000000002', 
       '00000000-0000-0000-0000-000000000001', 
       10, 
       'PO-123', 
       'Initial Stock', 
       '00000000-0000-0000-0000-000000000003' -- Idempotency Key 1
     ) $$,
  'book_in_stock should execute successfully'
);

-- 3. Verify: Ledger Entry Created
SELECT results_eq(
    $$ SELECT change_qoh FROM inventory_ledger WHERE idempotency_key = '00000000-0000-0000-0000-000000000003' $$,
    $$ VALUES (10) $$,
    'Ledger should have a +10 QOH entry'
);

-- 4. Verify: Snapshot Updated (Trigger Test)
SELECT results_eq(
    $$ SELECT qoh FROM inventory_snapshots WHERE product_id = '00000000-0000-0000-0000-000000000002' $$,
    $$ VALUES (10) $$,
    'Inventory Snapshot should be automatically updated by the trigger'
);

-- 5. Test: Idempotency (Duplicate Call)
-- We call the SAME function with the SAME key. It should return void (success) but NOT insert.
SELECT lives_ok(
  $$ SELECT book_in_stock(
       '00000000-0000-0000-0000-000000000002', 
       '00000000-0000-0000-0000-000000000001', 
       10, 
       'PO-123', 
       'Initial Stock', 
       '00000000-0000-0000-0000-000000000003' -- SAME Key
     ) $$,
  'Duplicate call with same idempotency key should not fail'
);

-- 6. Verify: No Double Counting
SELECT results_eq(
    $$ SELECT count(*)::integer FROM inventory_ledger WHERE idempotency_key = '00000000-0000-0000-0000-000000000003' $$,
    $$ VALUES (1) $$,
    'Ledger should still only have 1 entry for this key'
);

SELECT * FROM finish();
ROLLBACK;
