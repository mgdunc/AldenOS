-- Link sales order lines to products by SKU
-- This ensures product_id is set even when initially NULL

-- Function to automatically link unmatched sales order lines to products by SKU
CREATE OR REPLACE FUNCTION link_sales_order_lines_by_sku()
RETURNS TABLE(lines_updated INTEGER) AS $$
DECLARE
  updated_count INTEGER;
BEGIN
  -- Update sales_order_lines to set product_id where it's NULL but SKU matches
  UPDATE sales_order_lines sol
  SET product_id = p.id
  FROM products p
  WHERE sol.product_id IS NULL
    AND sol.sku IS NOT NULL
    AND TRIM(UPPER(sol.sku)) = TRIM(UPPER(p.sku));
  
  GET DIAGNOSTICS updated_count = ROW_COUNT;
  
  RETURN QUERY SELECT updated_count;
END;
$$ LANGUAGE plpgsql;

-- Trigger function to auto-link when a new sales order line is inserted
CREATE OR REPLACE FUNCTION auto_link_sales_line_to_product()
RETURNS TRIGGER AS $$
BEGIN
  -- If product_id is NULL but SKU is provided, try to find matching product
  IF NEW.product_id IS NULL AND NEW.sku IS NOT NULL THEN
    SELECT id INTO NEW.product_id
    FROM products
    WHERE TRIM(UPPER(sku)) = TRIM(UPPER(NEW.sku))
    LIMIT 1;
  END IF;
  
  -- If product_id is set, populate sku and product_name from products table
  IF NEW.product_id IS NOT NULL THEN
    SELECT sku, name 
    INTO NEW.sku, NEW.product_name
    FROM products
    WHERE id = NEW.product_id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger on INSERT
DROP TRIGGER IF EXISTS trg_auto_link_sales_line ON sales_order_lines;
CREATE TRIGGER trg_auto_link_sales_line
  BEFORE INSERT ON sales_order_lines
  FOR EACH ROW
  EXECUTE FUNCTION auto_link_sales_line_to_product();

-- Run the linking function to fix existing unlinked lines
SELECT link_sales_order_lines_by_sku();

COMMENT ON FUNCTION link_sales_order_lines_by_sku IS 'Links sales order lines to products by matching SKU (case-insensitive)';
COMMENT ON FUNCTION auto_link_sales_line_to_product IS 'Trigger function that automatically links sales order lines to products by SKU on insert';
