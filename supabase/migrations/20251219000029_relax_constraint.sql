-- Relax constraint to debug
ALTER TABLE "public"."inventory_snapshots"
DROP CONSTRAINT IF EXISTS "inventory_snapshots_reserved_check";

ALTER TABLE "public"."inventory_snapshots"
ADD CONSTRAINT "inventory_snapshots_reserved_check" CHECK (reserved > -1);
