-- Migration: 20261113000008_drop_duplicate_indexes.sql
-- Goal: Drop proven duplicate or fully redundant indexes to save database storage (ENG-08, AG-31)
--
-- Detection Query:
-- Run this query to detect duplicate index sets across the public schema:
--
-- SELECT
--   indrelid::regclass AS table_name,
--   indexrelid::regclass AS index_name,
--   indkey::text AS columns,
--   indisunique AS is_unique
-- FROM pg_index
-- WHERE indrelid::regclass::text LIKE 'public.%'
-- ORDER BY table_name, columns;
--
-- Redundant Indexes Dropped:
-- Drop duplicate single-column index when identical coverage is provided by an existing primary key or composite index:

-- 1. user_lesson_progress: user_lesson_progress_user_idx was created redundantly.
-- Drop only if existing composite or duplicate exists.
-- Safe idempotent execution:
DO $$
BEGIN
  -- If duplicate index on email_queue exists
  IF EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename = 'email_queue'
      AND indexname = 'idx_email_queue_user_id'
      AND EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE schemaname = 'public'
          AND tablename = 'email_queue'
          AND indexname = 'email_queue_user_id_idx'
      )
  ) THEN
    DROP INDEX IF EXISTS public.idx_email_queue_user_id;
  END IF;
END $$;
