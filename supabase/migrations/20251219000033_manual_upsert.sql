-- Fix: Replace ON CONFLICT with explicit UPDATE/INSERT to debug
CREATE OR REPLACE FUNCTION "public"."update_inventory_snapshot"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
    v_updated boolean;
BEGIN
  -- Try UPDATE first
  UPDATE public.inventory_snapshots
  SET 
    qoh = COALESCE(qoh, 0) + COALESCE(NEW.change_qoh, 0),
    reserved = COALESCE(reserved, 0) + COALESCE(NEW.change_reserved, 0),
    last_updated = NOW()
  WHERE product_id = NEW.product_id AND location_id = NEW.location_id;

  GET DIAGNOSTICS v_updated = ROW_COUNT;

  -- If no row updated, INSERT
  IF v_updated = 0 THEN
      INSERT INTO public.inventory_snapshots (product_id, location_id, qoh, reserved, last_updated)
      VALUES (
        NEW.product_id, 
        NEW.location_id, 
        COALESCE(NEW.change_qoh, 0), 
        COALESCE(NEW.change_reserved, 0),
        NOW()
      );
  END IF;

  RETURN NEW;
END;
$$;
