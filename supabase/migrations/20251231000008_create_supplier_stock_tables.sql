-- Supplier Stock Upload Tracking
-- Tracks each file upload with statistics and status

CREATE TABLE IF NOT EXISTS supplier_stock_uploads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    supplier_id UUID REFERENCES suppliers(id) ON DELETE SET NULL,
    upload_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    stock_date DATE NOT NULL DEFAULT CURRENT_DATE,
    file_name TEXT,
    status TEXT NOT NULL DEFAULT 'processing' CHECK (status IN ('processing', 'completed', 'failed')),
    total_rows INTEGER DEFAULT 0,
    matched_count INTEGER DEFAULT 0,
    unmatched_count INTEGER DEFAULT 0,
    error_message TEXT,
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Supplier Stock Levels (matched products)
-- Stores historical stock levels from supplier
CREATE TABLE IF NOT EXISTS supplier_stock_levels (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    supplier_id UUID REFERENCES suppliers(id) ON DELETE SET NULL,
    quantity INTEGER NOT NULL DEFAULT 0,
    stock_date DATE NOT NULL,
    upload_id UUID REFERENCES supplier_stock_uploads(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Ensure one record per product per date per supplier
    UNIQUE(product_id, supplier_id, stock_date)
);

-- Supplier Stock Unmatched (for review)
-- Stores SKUs that couldn't be matched to products
CREATE TABLE IF NOT EXISTS supplier_stock_unmatched (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    upload_id UUID NOT NULL REFERENCES supplier_stock_uploads(id) ON DELETE CASCADE,
    supplier_sku TEXT NOT NULL,
    product_name TEXT,
    quantity INTEGER,
    raw_data JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_supplier_stock_levels_product ON supplier_stock_levels(product_id);
CREATE INDEX IF NOT EXISTS idx_supplier_stock_levels_date ON supplier_stock_levels(stock_date DESC);
CREATE INDEX IF NOT EXISTS idx_supplier_stock_levels_supplier ON supplier_stock_levels(supplier_id);
CREATE INDEX IF NOT EXISTS idx_supplier_stock_uploads_supplier ON supplier_stock_uploads(supplier_id);
CREATE INDEX IF NOT EXISTS idx_supplier_stock_uploads_date ON supplier_stock_uploads(stock_date DESC);
CREATE INDEX IF NOT EXISTS idx_supplier_stock_unmatched_upload ON supplier_stock_unmatched(upload_id);

-- Enable RLS
ALTER TABLE supplier_stock_uploads ENABLE ROW LEVEL SECURITY;
ALTER TABLE supplier_stock_levels ENABLE ROW LEVEL SECURITY;
ALTER TABLE supplier_stock_unmatched ENABLE ROW LEVEL SECURITY;

-- RLS Policies (allow authenticated users full access)
CREATE POLICY supplier_stock_uploads_authenticated ON supplier_stock_uploads
    FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY supplier_stock_levels_authenticated ON supplier_stock_levels
    FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY supplier_stock_unmatched_authenticated ON supplier_stock_unmatched
    FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Function to get latest supplier stock for a product
CREATE OR REPLACE FUNCTION get_supplier_stock(p_product_id UUID)
RETURNS TABLE (
    quantity INTEGER,
    stock_date DATE,
    supplier_name TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        ssl.quantity,
        ssl.stock_date,
        s.name as supplier_name
    FROM supplier_stock_levels ssl
    LEFT JOIN suppliers s ON s.id = ssl.supplier_id
    WHERE ssl.product_id = p_product_id
    ORDER BY ssl.stock_date DESC
    LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get supplier stock history for a product (for charts)
CREATE OR REPLACE FUNCTION get_supplier_stock_history(p_product_id UUID, p_days INTEGER DEFAULT 30)
RETURNS TABLE (
    stock_date DATE,
    quantity INTEGER
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        ssl.stock_date,
        ssl.quantity
    FROM supplier_stock_levels ssl
    WHERE ssl.product_id = p_product_id
      AND ssl.stock_date >= CURRENT_DATE - p_days
    ORDER BY ssl.stock_date ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add supplier_available to product_inventory_view for easy access
-- First drop and recreate the view with the new column
DROP VIEW IF EXISTS product_inventory_view;

CREATE VIEW product_inventory_view AS
SELECT 
    p.id AS product_id,
    p.sku,
    p.name,
    p.description,
    p.barcode,
    p.cost_price,
    p.retail_price,
    p.list_price,
    p.compare_at_price,
    p.product_type,
    p.vendor,
    p.status,
    p.carton_qty,
    COALESCE(inv.qoh, 0) AS qoh,
    COALESCE(inv.reserved, 0) AS reserved,
    COALESCE(inv.available, 0) AS available,
    COALESCE(demand.total_demand, 0) AS demand,
    COALESCE(supplier_stock.quantity, 0) AS supplier_available,
    supplier_stock.stock_date AS supplier_stock_date
FROM products p
LEFT JOIN (
    SELECT 
        product_id,
        SUM(qoh) AS qoh,
        SUM(reserved) AS reserved,
        SUM(available) AS available
    FROM inventory_snapshots
    GROUP BY product_id
) inv ON inv.product_id = p.id
LEFT JOIN (
    SELECT 
        sol.product_id,
        SUM(sol.quantity_ordered - COALESCE(sol.quantity_fulfilled, 0)) AS total_demand
    FROM sales_order_lines sol
    JOIN sales_orders so ON so.id = sol.sales_order_id
    WHERE so.is_open = true
    GROUP BY sol.product_id
) demand ON demand.product_id = p.id
LEFT JOIN LATERAL (
    SELECT ssl.quantity, ssl.stock_date
    FROM supplier_stock_levels ssl
    WHERE ssl.product_id = p.id
    ORDER BY ssl.stock_date DESC
    LIMIT 1
) supplier_stock ON true;

-- Comments
COMMENT ON TABLE supplier_stock_uploads IS 'Tracks supplier stock file uploads with statistics';
COMMENT ON TABLE supplier_stock_levels IS 'Historical supplier stock levels matched to products';
COMMENT ON TABLE supplier_stock_unmatched IS 'Unmatched SKUs from supplier stock uploads for review';

