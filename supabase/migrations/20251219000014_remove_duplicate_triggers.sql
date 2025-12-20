-- Fix: Remove duplicate triggers that are causing double-counting

-- 1. Drop ALL potential triggers on inventory_ledger to ensure a clean slate
DROP TRIGGER IF EXISTS "on_ledger_insert" ON "public"."inventory_ledger";
DROP TRIGGER IF EXISTS "trg_update_inventory_snapshot" ON "public"."inventory_ledger";
DROP TRIGGER IF EXISTS "update_inventory_snapshot_trigger" ON "public"."inventory_ledger"; -- Just in case

-- 2. Re-create the SINGLE authoritative trigger
CREATE TRIGGER "trg_update_inventory_snapshot"
AFTER INSERT ON "public"."inventory_ledger"
FOR EACH ROW EXECUTE FUNCTION "public"."update_inventory_snapshot"();
