-- Enhanced RPC to process product import with more fields
CREATE OR REPLACE FUNCTION process_product_import(
    p_job_id UUID,
    p_items JSONB
) RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE
    item JSONB;
    v_sku TEXT;
    v_name TEXT;
    v_description TEXT;
    v_cost NUMERIC;
    v_price NUMERIC;
    v_compare_at NUMERIC;
    v_barcode TEXT;
    v_carton_barcode TEXT;
    v_carton_qty INT;
    v_supplier_sku TEXT;
    v_vendor TEXT;
    v_product_type TEXT;
    v_supplier_name TEXT;
    v_supplier_id UUID;
    v_status TEXT;
    v_success_count INT := 0;
    v_error_count INT := 0;
    v_created_count INT := 0;
    v_updated_count INT := 0;
    v_errors JSONB := '[]'::jsonb;
    v_existing_id UUID;
BEGIN
    -- Update status to processing
    UPDATE import_jobs SET status = 'processing' WHERE id = p_job_id;

    FOR item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        BEGIN
            v_sku := item->>'sku';
            v_name := item->>'name';
            v_description := NULLIF(item->>'description', '');
            v_barcode := NULLIF(item->>'barcode', '');
            v_carton_barcode := NULLIF(item->>'carton_barcode', '');
            v_supplier_sku := NULLIF(item->>'supplier_sku', '');
            v_vendor := NULLIF(item->>'vendor', '');
            v_product_type := NULLIF(item->>'product_type', '');
            v_supplier_name := NULLIF(item->>'supplier', '');
            v_status := COALESCE(NULLIF(item->>'status', ''), 'active');
            
            -- Normalize status values
            v_status := LOWER(v_status);
            IF v_status IN ('yes', 'true', '1', 'y', 'enabled') THEN
                v_status := 'active';
            ELSIF v_status IN ('no', 'false', '0', 'n', 'disabled') THEN
                v_status := 'inactive';
            ELSIF v_status NOT IN ('active', 'inactive', 'discontinued', 'archived') THEN
                v_status := 'active';
            END IF;
            
            -- Handle numeric conversions safely
            BEGIN
                v_cost := (item->>'cost_price')::NUMERIC;
            EXCEPTION WHEN OTHERS THEN v_cost := NULL; END;

            BEGIN
                v_price := (item->>'list_price')::NUMERIC;
            EXCEPTION WHEN OTHERS THEN v_price := NULL; END;

            BEGIN
                v_compare_at := (item->>'compare_at_price')::NUMERIC;
            EXCEPTION WHEN OTHERS THEN v_compare_at := NULL; END;

            BEGIN
                v_carton_qty := (item->>'carton_qty')::INT;
            EXCEPTION WHEN OTHERS THEN v_carton_qty := NULL; END;

            -- Resolve Supplier if provided
            v_supplier_id := NULL;
            IF v_supplier_name IS NOT NULL THEN
                SELECT id INTO v_supplier_id FROM suppliers WHERE name ILIKE v_supplier_name LIMIT 1;
            END IF;

            -- Check if product exists
            SELECT id INTO v_existing_id FROM products WHERE sku = v_sku;

            -- Upsert Product
            INSERT INTO products (
                sku, 
                name, 
                description,
                cost_price, 
                list_price, 
                compare_at_price,
                barcode, 
                carton_barcode, 
                carton_qty, 
                supplier_sku,
                vendor,
                product_type,
                supplier_id, 
                status
            ) VALUES (
                v_sku,
                COALESCE(v_name, v_sku),
                v_description,
                v_cost,
                v_price,
                v_compare_at,
                v_barcode,
                v_carton_barcode,
                v_carton_qty,
                v_supplier_sku,
                v_vendor,
                v_product_type,
                v_supplier_id,
                v_status
            )
            ON CONFLICT (sku) DO UPDATE SET
                name = COALESCE(EXCLUDED.name, products.name),
                description = COALESCE(EXCLUDED.description, products.description),
                cost_price = COALESCE(EXCLUDED.cost_price, products.cost_price),
                list_price = COALESCE(EXCLUDED.list_price, products.list_price),
                compare_at_price = COALESCE(EXCLUDED.compare_at_price, products.compare_at_price),
                barcode = COALESCE(EXCLUDED.barcode, products.barcode),
                carton_barcode = COALESCE(EXCLUDED.carton_barcode, products.carton_barcode),
                carton_qty = COALESCE(EXCLUDED.carton_qty, products.carton_qty),
                supplier_sku = COALESCE(EXCLUDED.supplier_sku, products.supplier_sku),
                vendor = COALESCE(EXCLUDED.vendor, products.vendor),
                product_type = COALESCE(EXCLUDED.product_type, products.product_type),
                supplier_id = COALESCE(EXCLUDED.supplier_id, products.supplier_id),
                status = EXCLUDED.status,
                updated_at = NOW();

            v_success_count := v_success_count + 1;
            
            -- Track creates vs updates
            IF v_existing_id IS NULL THEN
                v_created_count := v_created_count + 1;
            ELSE
                v_updated_count := v_updated_count + 1;
            END IF;

        EXCEPTION WHEN OTHERS THEN
            v_error_count := v_error_count + 1;
            v_errors := v_errors || jsonb_build_object(
                'sku', v_sku,
                'error', SQLERRM
            );
        END;
    END LOOP;

    -- Update Job with detailed results
    UPDATE import_jobs 
    SET 
        status = CASE WHEN v_error_count > 0 THEN 'completed_with_errors' ELSE 'completed' END,
        success_count = v_success_count,
        error_count = v_error_count,
        errors = v_errors,
        notes = 'Created: ' || v_created_count || ', Updated: ' || v_updated_count
    WHERE id = p_job_id;
END;
$$;

-- Add notes column to import_jobs if it doesn't exist
ALTER TABLE import_jobs ADD COLUMN IF NOT EXISTS notes TEXT;

