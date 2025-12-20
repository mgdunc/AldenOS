-- RPC to process product import (Upsert)
CREATE OR REPLACE FUNCTION process_product_import(
    p_job_id UUID,
    p_items JSONB
) RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE
    item JSONB;
    v_sku TEXT;
    v_name TEXT;
    v_cost NUMERIC;
    v_price NUMERIC;
    v_barcode TEXT;
    v_carton_barcode TEXT;
    v_carton_qty INT;
    v_supplier_name TEXT;
    v_supplier_id UUID;
    v_success_count INT := 0;
    v_error_count INT := 0;
    v_errors JSONB := '[]'::jsonb;
BEGIN
    -- Update status to processing
    UPDATE import_jobs SET status = 'processing' WHERE id = p_job_id;

    FOR item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        BEGIN
            v_sku := item->>'sku';
            v_name := item->>'name';
            
            -- Handle numeric conversions safely
            BEGIN
                v_cost := (item->>'cost_price')::NUMERIC;
            EXCEPTION WHEN OTHERS THEN v_cost := 0; END;

            BEGIN
                v_price := (item->>'list_price')::NUMERIC;
            EXCEPTION WHEN OTHERS THEN v_price := 0; END;

            BEGIN
                v_carton_qty := (item->>'carton_qty')::INT;
            EXCEPTION WHEN OTHERS THEN v_carton_qty := 1; END;

            v_barcode := item->>'barcode';
            v_carton_barcode := item->>'carton_barcode';
            v_supplier_name := item->>'supplier';

            -- Resolve Supplier if provided
            v_supplier_id := NULL;
            IF v_supplier_name IS NOT NULL AND v_supplier_name != '' THEN
                SELECT id INTO v_supplier_id FROM suppliers WHERE name ILIKE v_supplier_name LIMIT 1;
            END IF;

            -- Upsert Product
            INSERT INTO products (
                sku, name, cost_price, list_price, barcode, carton_barcode, carton_qty, supplier_id, status
            ) VALUES (
                v_sku,
                COALESCE(v_name, v_sku), -- Fallback name
                COALESCE(v_cost, 0),
                COALESCE(v_price, 0),
                v_barcode,
                v_carton_barcode,
                COALESCE(v_carton_qty, 1),
                v_supplier_id,
                'active'
            )
            ON CONFLICT (sku) DO UPDATE SET
                name = EXCLUDED.name,
                cost_price = EXCLUDED.cost_price,
                list_price = EXCLUDED.list_price,
                barcode = EXCLUDED.barcode,
                carton_barcode = EXCLUDED.carton_barcode,
                carton_qty = EXCLUDED.carton_qty,
                supplier_id = COALESCE(EXCLUDED.supplier_id, products.supplier_id), -- Only update if new one found
                updated_at = NOW();

            v_success_count := v_success_count + 1;

        EXCEPTION WHEN OTHERS THEN
            v_error_count := v_error_count + 1;
            v_errors := v_errors || jsonb_build_object(
                'sku', v_sku,
                'error', SQLERRM
            );
        END;
    END LOOP;

    -- Update Job
    UPDATE import_jobs 
    SET 
        status = CASE WHEN v_error_count > 0 THEN 'completed_with_errors' ELSE 'completed' END,
        success_count = v_success_count,
        error_count = v_error_count,
        errors = v_errors
    WHERE id = p_job_id;
END;
$$;
