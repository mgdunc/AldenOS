-- 1. Add is_open to sales_orders
ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS is_open boolean DEFAULT true;

-- 2. Backfill is_open
UPDATE sales_orders 
SET is_open = CASE 
    WHEN status IN ('completed', 'cancelled', 'draft') THEN false 
    ELSE true 
END;

-- 3. Trigger to maintain is_open
CREATE OR REPLACE FUNCTION update_sales_order_is_open()
RETURNS TRIGGER AS $$
BEGIN
    NEW.is_open := CASE 
        WHEN NEW.status IN ('completed', 'cancelled', 'draft') THEN false 
        ELSE true 
    END;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_update_sales_order_is_open ON sales_orders;
CREATE TRIGGER trg_update_sales_order_is_open
BEFORE INSERT OR UPDATE OF status ON sales_orders
FOR EACH ROW
EXECUTE FUNCTION update_sales_order_is_open();

-- 4. Ensure quantity_fulfilled has default 0
ALTER TABLE sales_order_lines ALTER COLUMN quantity_fulfilled SET DEFAULT 0;
UPDATE sales_order_lines SET quantity_fulfilled = 0 WHERE quantity_fulfilled IS NULL;

-- 5. Trigger to update quantity_fulfilled on sales_order_lines
CREATE OR REPLACE FUNCTION update_line_fulfillment_qty()
RETURNS TRIGGER AS $$
DECLARE
    v_line record;
BEGIN
    -- Only run if status changed to 'shipped'
    IF NEW.status = 'shipped' AND (OLD.status IS NULL OR OLD.status != 'shipped') THEN
        FOR v_line IN SELECT * FROM fulfillment_lines WHERE fulfillment_id = NEW.id LOOP
            UPDATE sales_order_lines
            SET quantity_fulfilled = COALESCE(quantity_fulfilled, 0) + v_line.quantity
            WHERE id = v_line.sales_order_line_id;
        END LOOP;
    END IF;
    
    -- Handle un-shipping (if status moves back from shipped)
    IF OLD.status = 'shipped' AND NEW.status != 'shipped' THEN
         FOR v_line IN SELECT * FROM fulfillment_lines WHERE fulfillment_id = NEW.id LOOP
            UPDATE sales_order_lines
            SET quantity_fulfilled = GREATEST(0, COALESCE(quantity_fulfilled, 0) - v_line.quantity)
            WHERE id = v_line.sales_order_line_id;
        END LOOP;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_update_line_fulfillment_qty ON fulfillments;
CREATE TRIGGER trg_update_line_fulfillment_qty
AFTER UPDATE OF status ON fulfillments
FOR EACH ROW
EXECUTE FUNCTION update_line_fulfillment_qty();
