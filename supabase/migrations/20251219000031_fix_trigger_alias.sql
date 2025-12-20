-- Fix: Use explicit alias in ON CONFLICT to avoid ambiguity
CREATE OR REPLACE FUNCTION "public"."update_inventory_snapshot"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
    v_old_reserved int;
    v_new_reserved int;
BEGIN
  -- Debug log
  SELECT reserved INTO v_old_reserved FROM inventory_snapshots 
  WHERE product_id = NEW.product_id AND location_id = NEW.location_id;
  
  RAISE NOTICE 'DEBUG TRIGGER: Old=%, Change=%', v_old_reserved, NEW.change_reserved;

  -- Insert or Update with Explicit Alias
  INSERT INTO public.inventory_snapshots AS target (product_id, location_id, qoh, reserved, last_updated)
  VALUES (
    NEW.product_id, 
    NEW.location_id, 
    COALESCE(NEW.change_qoh, 0), 
    COALESCE(NEW.change_reserved, 0),
    NOW()
  )
  ON CONFLICT (product_id, location_id)
  DO UPDATE SET
    qoh = COALESCE(target.qoh, 0) + COALESCE(NEW.change_qoh, 0),
    reserved = COALESCE(target.reserved, 0) + COALESCE(NEW.change_reserved, 0),
    last_updated = NOW();

  RETURN NEW;
END;
$$;
