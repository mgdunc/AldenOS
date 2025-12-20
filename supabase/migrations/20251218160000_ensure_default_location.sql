-- Ensure a default location exists
INSERT INTO public.locations (name, description, is_sellable, is_default)
SELECT 'Main Warehouse', 'Primary storage location', true, true
WHERE NOT EXISTS (SELECT 1 FROM public.locations);
