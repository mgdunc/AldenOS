-- Remove unique constraint on provider column to allow multiple stores of the same type
ALTER TABLE public.integrations DROP CONSTRAINT IF EXISTS integrations_provider_key;

-- Add a name column for better identification (optional but good practice)
ALTER TABLE public.integrations ADD COLUMN IF NOT EXISTS name TEXT;
