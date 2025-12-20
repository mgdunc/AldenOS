ALTER TABLE products 
ADD COLUMN IF NOT EXISTS supplier_id UUID REFERENCES suppliers(id),
ADD COLUMN IF NOT EXISTS carton_barcode TEXT;

-- Add an index for the foreign key
CREATE INDEX IF NOT EXISTS idx_products_supplier_id ON products(supplier_id);
