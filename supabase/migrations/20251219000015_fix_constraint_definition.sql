-- Fix: Re-define constraint to ensure it is correct and debug trigger

-- 1. Drop the constraint to be sure
ALTER TABLE "public"."inventory_snapshots"
DROP CONSTRAINT IF EXISTS "inventory_snapshots_reserved_check";

-- 2. Re-add the constraint explicitly
ALTER TABLE "public"."inventory_snapshots"
ADD CONSTRAINT "inventory_snapshots_reserved_check" CHECK (reserved >= 0);

-- 3. Update trigger to log values (for debugging if it still fails)
CREATE OR REPLACE FUNCTION "public"."update_inventory_snapshot"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
    v_old_reserved int;
    v_new_reserved int;
BEGIN
  -- Get old value for debugging (optional, but helpful)
  SELECT reserved INTO v_old_reserved FROM inventory_snapshots 
  WHERE product_id = NEW.product_id AND location_id = NEW.location_id;

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
    last_updated = NOW()
  RETURNING reserved INTO v_new_reserved;

  -- RAISE NOTICE 'Snapshot Update: Old=%, Change=%, New=%', v_old_reserved, NEW.change_reserved, v_new_reserved;

  RETURN NEW;
END;
$$;
