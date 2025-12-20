-- Fix: Debugging the unreserve logic with extreme prejudice

-- 1. Drop the constraint temporarily to see what the value actually becomes
ALTER TABLE "public"."inventory_snapshots"
DROP CONSTRAINT IF EXISTS "inventory_snapshots_reserved_check";

-- 2. Update the trigger to log the value that WOULD have failed
CREATE OR REPLACE FUNCTION "public"."update_inventory_snapshot"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
    v_old_reserved int;
    v_new_reserved int;
BEGIN
  -- Get old value
  SELECT reserved INTO v_old_reserved FROM inventory_snapshots 
  WHERE product_id = NEW.product_id AND location_id = NEW.location_id;

  -- Perform Update
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

  -- Check if it is negative (which would have violated the constraint)
  IF v_new_reserved < 0 THEN
      RAISE EXCEPTION 'Negative Reserved Detected! Old: %, Change: %, New: %, Prod: %, Loc: %', 
          v_old_reserved, NEW.change_reserved, v_new_reserved, NEW.product_id, NEW.location_id;
  END IF;

  RETURN NEW;
END;
$$;

-- 3. Re-add the constraint (but maybe the exception above will catch it first and give us better info)
-- Actually, let's NOT re-add it yet. Let's let the transaction fail via the RAISE EXCEPTION above.
-- This ensures we get the custom error message.
