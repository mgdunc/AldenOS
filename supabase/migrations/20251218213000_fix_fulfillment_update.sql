-- Enable UPDATE for authenticated users on fulfillments
CREATE POLICY "Enable update for authenticated users only" 
ON "public"."fulfillments" 
FOR UPDATE 
TO "authenticated" 
USING (true) 
WITH CHECK (true);
