-- Clean up bad data before applying constraints
UPDATE "public"."sales_order_lines" SET quantity_allocated = 0 WHERE quantity_allocated < 0;
UPDATE "public"."sales_order_lines" SET quantity_fulfilled = 0 WHERE quantity_fulfilled < 0;
UPDATE "public"."inventory_snapshots" SET qoh = 0 WHERE qoh < 0;
UPDATE "public"."inventory_snapshots" SET reserved = 0 WHERE reserved < 0;

-- Add constraints to prevent negative values

-- sales_order_lines
ALTER TABLE "public"."sales_order_lines"
ADD CONSTRAINT "sales_order_lines_quantity_allocated_check" CHECK (quantity_allocated >= 0);

ALTER TABLE "public"."sales_order_lines"
ADD CONSTRAINT "sales_order_lines_quantity_fulfilled_check" CHECK (quantity_fulfilled >= 0);

-- inventory_snapshots
ALTER TABLE "public"."inventory_snapshots"
ADD CONSTRAINT "inventory_snapshots_qoh_check" CHECK (qoh >= 0);

ALTER TABLE "public"."inventory_snapshots"
ADD CONSTRAINT "inventory_snapshots_reserved_check" CHECK (reserved >= 0);
