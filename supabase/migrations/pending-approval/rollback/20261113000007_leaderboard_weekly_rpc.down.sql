-- Rollback: 20261113000007_leaderboard_weekly_rpc.down.sql
-- Reverts: 20261113000007_leaderboard_weekly_rpc.sql

DROP FUNCTION IF EXISTS public.get_weekly_leaderboard(timestamptz, int, int);
DROP FUNCTION IF EXISTS public.get_database_size_bytes();
DROP INDEX IF EXISTS public.idx_user_lesson_progress_weekly_completed;
DROP INDEX IF EXISTS public.idx_xp_events_weekly_created;
