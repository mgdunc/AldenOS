-- Relax foreign key constraint on import_jobs to prevent development friction
ALTER TABLE import_jobs DROP CONSTRAINT IF EXISTS import_jobs_user_id_fkey;

-- Make user_id optional (nullable) just in case
ALTER TABLE import_jobs ALTER COLUMN user_id DROP NOT NULL;
