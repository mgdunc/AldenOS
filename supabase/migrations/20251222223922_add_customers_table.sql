-- Create customers table
CREATE TABLE IF NOT EXISTS customers (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL,
    email text,
    phone text,
    company text,
    billing_address jsonb,
    shipping_address jsonb,
    notes text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- Add RLS policies for customers
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Enable read access for authenticated users" ON customers
    FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Enable insert for authenticated users" ON customers
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Enable update for authenticated users" ON customers
    FOR UPDATE USING (auth.role() = 'authenticated');

CREATE POLICY "Enable delete for authenticated users" ON customers
    FOR DELETE USING (auth.role() = 'authenticated');

-- Add customer_id column to sales_orders
ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS customer_id uuid REFERENCES customers(id) ON DELETE SET NULL;

-- Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_sales_orders_customer_id ON sales_orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_customers_email ON customers(email);
CREATE INDEX IF NOT EXISTS idx_customers_name ON customers(name);

-- Migrate existing customer_name data to customers table
-- This will create customer records from existing sales orders and link them
DO $$
DECLARE
    customer_record RECORD;
    new_customer_id uuid;
BEGIN
    -- Loop through distinct customer names in sales_orders
    FOR customer_record IN 
        SELECT DISTINCT customer_name 
        FROM sales_orders 
        WHERE customer_name IS NOT NULL 
        AND customer_name != ''
        AND customer_id IS NULL
    LOOP
        -- Check if customer already exists
        SELECT id INTO new_customer_id
        FROM customers
        WHERE name = customer_record.customer_name
        LIMIT 1;
        
        -- If customer doesn't exist, create it
        IF new_customer_id IS NULL THEN
            INSERT INTO customers (name)
            VALUES (customer_record.customer_name)
            RETURNING id INTO new_customer_id;
        END IF;
        
        -- Update sales_orders with the customer_id
        UPDATE sales_orders
        SET customer_id = new_customer_id
        WHERE customer_name = customer_record.customer_name
        AND customer_id IS NULL;
    END LOOP;
END $$;

-- Create a view that joins sales_orders with customer details
CREATE OR REPLACE VIEW sales_orders_with_customer AS
SELECT 
    so.*,
    c.name as customer_name_ref,
    c.email as customer_email_ref,
    c.phone as customer_phone_ref,
    c.company as customer_company,
    c.billing_address as customer_billing_address,
    c.shipping_address as customer_shipping_address
FROM sales_orders so
LEFT JOIN customers c ON so.customer_id = c.id;

-- Add trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_customers_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER customers_updated_at
    BEFORE UPDATE ON customers
    FOR EACH ROW
    EXECUTE FUNCTION update_customers_updated_at();

-- Add comment
COMMENT ON TABLE customers IS 'Customer information for sales orders';
COMMENT ON VIEW sales_orders_with_customer IS 'Sales orders joined with customer details for easy querying';
