-- Create table for unmatched products from integrations
CREATE TABLE IF NOT EXISTS integration_unmatched_products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    integration_id UUID REFERENCES integrations(id) ON DELETE CASCADE,
    external_product_id TEXT,
    external_variant_id TEXT,
    sku TEXT,
    name TEXT,
    variant_name TEXT,
    price NUMERIC,
    cost NUMERIC,
    data JSONB,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(integration_id, external_variant_id)
);

-- Enable RLS
ALTER TABLE integration_unmatched_products ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Authenticated users can manage unmatched" ON integration_unmatched_products
    FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- RPC to import unmatched products
CREATE OR REPLACE FUNCTION import_unmatched_products(
    p_unmatched_ids UUID[],
    p_supplier_id UUID DEFAULT NULL
)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_count INT := 0;
    v_record RECORD;
    v_new_product_id UUID;
BEGIN
    FOR v_record IN 
        SELECT * FROM integration_unmatched_products 
        WHERE id = ANY(p_unmatched_ids)
    LOOP
        -- Create Product
        INSERT INTO products (
            name,
            sku,
            description,
            list_price,
            cost_price,
            status,
            supplier_id,
            shopify_product_id,
            shopify_variant_id
        ) VALUES (
            COALESCE(v_record.variant_name, v_record.name),
            v_record.sku,
            v_record.name, -- Use main product name as description if variant name is used as title
            v_record.price,
            v_record.cost,
            'active',
            p_supplier_id,
            NULL, -- We will link via product_integrations table instead
            NULL
        )
        RETURNING id INTO v_new_product_id;

        -- Create Link in product_integrations
        INSERT INTO product_integrations (
            product_id,
            integration_id,
            external_product_id,
            external_variant_id
        ) VALUES (
            v_new_product_id,
            v_record.integration_id,
            v_record.external_product_id,
            v_record.external_variant_id
        );

        -- Delete from unmatched
        DELETE FROM integration_unmatched_products WHERE id = v_record.id;
        
        v_count := v_count + 1;
    END LOOP;

    RETURN v_count;
END;
$$;
