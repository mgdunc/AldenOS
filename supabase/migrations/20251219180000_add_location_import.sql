-- RPC to process location import (Upsert)
CREATE OR REPLACE FUNCTION process_location_import(
    p_job_id UUID,
    p_items JSONB
) RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE
    item JSONB;
    v_name TEXT;
    v_description TEXT;
    v_is_sellable BOOLEAN;
    v_is_default BOOLEAN;
    v_success_count INT := 0;
    v_error_count INT := 0;
    v_errors JSONB := '[]'::jsonb;
BEGIN
    -- Update status to processing
    UPDATE import_jobs SET status = 'processing' WHERE id = p_job_id;

    FOR item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        BEGIN
            v_name := item->>'name';
            v_description := item->>'description';
            
            -- Handle boolean conversions
            -- Default is_sellable to true if not provided or invalid
            BEGIN
                IF item->>'is_sellable' IS NULL OR item->>'is_sellable' = '' THEN
                    v_is_sellable := true;
                ELSE
                    v_is_sellable := (item->>'is_sellable')::BOOLEAN;
                END IF;
            EXCEPTION WHEN OTHERS THEN v_is_sellable := true; END;

            -- Default is_default to false if not provided or invalid
            BEGIN
                IF item->>'is_default' IS NULL OR item->>'is_default' = '' THEN
                    v_is_default := false;
                ELSE
                    v_is_default := (item->>'is_default')::BOOLEAN;
                END IF;
            EXCEPTION WHEN OTHERS THEN v_is_default := false; END;

            -- Upsert Location based on Name
            INSERT INTO locations (name, description, is_sellable, is_default)
            VALUES (v_name, v_description, v_is_sellable, v_is_default)
            ON CONFLICT (name) DO UPDATE SET
                description = EXCLUDED.description,
                is_sellable = EXCLUDED.is_sellable,
                is_default = EXCLUDED.is_default;

            v_success_count := v_success_count + 1;

        EXCEPTION WHEN OTHERS THEN
            v_error_count := v_error_count + 1;
            v_errors := v_errors || jsonb_build_object(
                'name', v_name,
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
