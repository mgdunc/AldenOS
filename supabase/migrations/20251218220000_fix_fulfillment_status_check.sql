-- Fix the check constraint to match the application logic (packed vs packing)
ALTER TABLE "public"."fulfillments" DROP CONSTRAINT "fulfillments_status_check";

ALTER TABLE "public"."fulfillments" 
ADD CONSTRAINT "fulfillments_status_check" 
CHECK (status IN ('draft', 'picking', 'packed', 'shipped', 'cancelled'));
