-- Add more constraints to prevent negative values

-- purchase_order_lines
ALTER TABLE "public"."purchase_order_lines"
ADD CONSTRAINT "purchase_order_lines_quantity_received_check" CHECK (quantity_received >= 0);

ALTER TABLE "public"."purchase_order_lines"
ADD CONSTRAINT "purchase_order_lines_unit_cost_check" CHECK (unit_cost >= 0);

-- sales_order_lines
ALTER TABLE "public"."sales_order_lines"
ADD CONSTRAINT "sales_order_lines_unit_price_check" CHECK (unit_price >= 0);
