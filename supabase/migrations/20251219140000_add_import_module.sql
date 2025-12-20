-- 1. Add import_job_id to inventory_ledger
ALTER TABLE inventory_ledger ADD COLUMN IF NOT EXISTS import_job_id UUID;

-- 2. Create import_jobs table
CREATE TABLE IF NOT EXISTS import_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ DEFAULT now(),
    user_id UUID REFERENCES auth.users(id),
    status TEXT NOT NULL DEFAULT 'pending', -- pending, processing, completed, completed_with_errors, failed
    total_rows INT DEFAULT 0,
    success_count INT DEFAULT 0,
    error_count INT DEFAULT 0,
    errors JSONB DEFAULT '[]'::jsonb,
    filename TEXT
);

-- Enable RLS
ALTER TABLE import_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Enable all access for authenticated users" ON import_jobs FOR ALL USING (auth.role() = 'authenticated');

-- 3. RPC to process inventory import
CREATE OR REPLACE FUNCTION process_inventory_import(
    p_job_id UUID,
    p_items JSONB
) RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE
    item JSONB;
    v_product_id UUID;
    v_location_id UUID;
    v_sku TEXT;
    v_loc_name TEXT;
    v_qty INT;
    v_notes TEXT;
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
            v_loc_name := item->>'location';
            v_qty := (item->>'quantity')::INT;
            v_notes := COALESCE(item->>'notes', 'Imported via Wizard');

            -- Lookup Product
            SELECT id INTO v_product_id FROM products WHERE sku = v_sku;
            IF v_product_id IS NULL THEN
                RAISE EXCEPTION 'Product not found: %', v_sku;
            END IF;

            -- Lookup Location
            SELECT id INTO v_location_id FROM locations WHERE name = v_loc_name;
            IF v_location_id IS NULL THEN
                RAISE EXCEPTION 'Location not found: %', v_loc_name;
            END IF;

            -- Insert into Ledger
            INSERT INTO inventory_ledger (
                product_id,
                location_id,
                transaction_type,
                change_qoh,
                notes,
                import_job_id,
                reference_id
            ) VALUES (
                v_product_id,
                v_location_id,
                'adjustment', -- Default to adjustment for imports
                v_qty,
                v_notes,
                p_job_id,
                'IMPORT-' || substring(p_job_id::text, 1, 8)
            );

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
