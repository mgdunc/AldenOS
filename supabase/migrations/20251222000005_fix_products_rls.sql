-- Enable RLS on products (ensure it is enabled)
ALTER TABLE "public"."products" ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to insert products
CREATE POLICY "Enable insert for authenticated users" ON "public"."products"
FOR INSERT TO authenticated
WITH CHECK (true);

-- Allow authenticated users to update products
CREATE POLICY "Enable update for authenticated users" ON "public"."products"
FOR UPDATE TO authenticated
USING (true)
WITH CHECK (true);

-- Allow authenticated users to delete products
CREATE POLICY "Enable delete for authenticated users" ON "public"."products"
FOR DELETE TO authenticated
USING (true);
