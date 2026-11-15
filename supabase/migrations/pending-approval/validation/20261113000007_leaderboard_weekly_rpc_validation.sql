-- Validation: 20261113000007_leaderboard_weekly_rpc_validation.sql
-- Read-only check: verifies functions and indexes exist.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc
    JOIN pg_namespace ON pg_namespace.oid = pg_proc.pronamespace
    WHERE pg_namespace.nspname = 'public'
      AND pg_proc.proname = 'get_weekly_leaderboard'
  ) THEN
    RAISE EXCEPTION 'Validation failed: get_weekly_leaderboard function does not exist';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc
    JOIN pg_namespace ON pg_namespace.oid = pg_proc.pronamespace
    WHERE pg_namespace.nspname = 'public'
      AND pg_proc.proname = 'get_database_size_bytes'
  ) THEN
    RAISE EXCEPTION 'Validation failed: get_database_size_bytes function does not exist';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'idx_user_lesson_progress_weekly_completed'
  ) THEN
    RAISE EXCEPTION 'Validation failed: idx_user_lesson_progress_weekly_completed does not exist';
  END IF;
END $$;
