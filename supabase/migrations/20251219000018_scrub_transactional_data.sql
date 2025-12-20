-- Scrub all transactional data to reset the system for testing
-- Keeps Master Data (Products, Locations, Suppliers) intact.

TRUNCATE TABLE 
    "public"."fulfillment_lines",
    "public"."fulfillments",
    "public"."sales_order_lines",
    "public"."sales_orders",
    "public"."inventory_receipt_lines",
    "public"."inventory_receipts",
    "public"."purchase_order_lines",
    "public"."purchase_orders",
    "public"."inventory_ledger",
    "public"."inventory_snapshots"
RESTART IDENTITY CASCADE;
