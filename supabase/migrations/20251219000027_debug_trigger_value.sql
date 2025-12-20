-- Debug trigger value
CREATE OR REPLACE FUNCTION "public"."update_inventory_snapshot"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
    v_old_reserved int;
    v_new_reserved int;
BEGIN
  SELECT reserved INTO v_old_reserved FROM inventory_snapshots 
  WHERE product_id = NEW.product_id AND location_id = NEW.location_id;

  v_new_reserved := COALESCE(v_old_reserved, 0) + COALESCE(NEW.change_reserved, 0);
  
  RAISE NOTICE 'DEBUG TRIGGER: Old=%, Change=%, New=%', v_old_reserved, NEW.change_reserved, v_new_reserved;

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
