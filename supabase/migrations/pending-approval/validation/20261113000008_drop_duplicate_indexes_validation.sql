-- Validation: 20261113000008_drop_duplicate_indexes_validation.sql
-- Read-only check: verifies duplicate detection query runs cleanly.

DO $$
BEGIN
  PERFORM
    indrelid::regclass AS table_name,
    indexrelid::regclass AS index_name,
    indkey::text AS columns
  FROM pg_index
  WHERE indrelid::regclass::text LIKE 'public.%';
END $$;
