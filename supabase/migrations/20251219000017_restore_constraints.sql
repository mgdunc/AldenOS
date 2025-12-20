-- Final Fix: Restore constraints and clean up

-- 1. Safety: Fix any negative values that might have slipped in while constraint was off
UPDATE "public"."inventory_snapshots"
SET reserved = 0
WHERE reserved < 0;

UPDATE "public"."inventory_snapshots"
SET qoh = 0
WHERE qoh < 0;

-- 2. Restore the Constraint
ALTER TABLE "public"."inventory_snapshots"
DROP CONSTRAINT IF EXISTS "inventory_snapshots_reserved_check";

ALTER TABLE "public"."inventory_snapshots"
ADD CONSTRAINT "inventory_snapshots_reserved_check" CHECK (reserved >= 0);

-- 3. Restore the Clean Trigger (remove debug logging)
CREATE OR REPLACE FUNCTION "public"."update_inventory_snapshot"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  -- Insert or Update the Snapshot for this Product/Location
  INSERT INTO public.inventory_snapshots (product_id, location_id, qoh, reserved, last_updated)
  VALUES (
    NEW.product_id, 
    NEW.location_id, 
    COALESCE(NEW.change_qoh, 0), 
    COALESCE(NEW.change_reserved, 0),
    NOW()
  )
  ON CONFLICT (product_id, location_id)
  DO UPDATE SET
    qoh = COALESCE(inventory_snapshots.qoh, 0) + COALESCE(NEW.change_qoh, 0),
    reserved = COALESCE(inventory_snapshots.reserved, 0) + COALESCE(NEW.change_reserved, 0),
    last_updated = NOW();

  RETURN NEW;
END;
$$;
