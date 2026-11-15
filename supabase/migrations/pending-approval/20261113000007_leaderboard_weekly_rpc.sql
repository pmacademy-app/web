-- Migration: 20261113000007_leaderboard_weekly_rpc.sql
-- Goal: Leaderboard weekly ranking aggregation in SQL RPC and database size telemetry helper (ENG-08, ENG-10, AG-31)
--
-- Why:
-- The weekly leaderboard reloaded every user's progress and XP rows into each server instance
-- and ranked them in JavaScript. Moving this aggregation to an RPC executes the grouping and
-- ordering inside the database engine.
-- Also provides get_database_size_bytes() to monitor database growth on the Supabase 500 MB free tier.

CREATE OR REPLACE FUNCTION public.get_weekly_leaderboard(
  p_week_start timestamptz,
  p_limit int DEFAULT 50,
  p_offset int DEFAULT 0
)
RETURNS TABLE (
  user_id uuid,
  username text,
  name text,
  avatar_url text,
  level int,
  total_xp int,
  current_streak int,
  days_studied int,
  lessons_completed int,
  xp_earned int,
  rank bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH active_users AS (
    SELECT
      u.id,
      u.username,
      u.name,
      u.avatar_url,
      u.level,
      u.total_xp,
      u.current_streak
    FROM public.users u
    LEFT JOIN public.user_leaderboard_settings s ON s.user_id = u.id
    WHERE u.total_xp > 0
      AND (s.is_opted_in IS NULL OR s.is_opted_in = true)
  ),
  weekly_lessons AS (
    SELECT
      lp.user_id,
      COUNT(*)::int AS lessons_completed,
      COUNT(DISTINCT lp.completed_at::date)::int AS days_studied
    FROM public.user_lesson_progress lp
    WHERE lp.status = 'completed'
      AND lp.completed_at >= p_week_start
    GROUP BY lp.user_id
  ),
  weekly_xp AS (
    SELECT
      xe.user_id,
      COALESCE(SUM(xe.xp_amount), 0)::int AS xp_earned
    FROM public.xp_events xe
    WHERE xe.created_at >= p_week_start
    GROUP BY xe.user_id
  ),
  ranked AS (
    SELECT
      u.id AS user_id,
      u.username,
      u.name,
      u.avatar_url,
      COALESCE(u.level, 1) AS level,
      COALESCE(u.total_xp, 0) AS total_xp,
      COALESCE(u.current_streak, 0) AS current_streak,
      COALESCE(wl.days_studied, 0) AS days_studied,
      COALESCE(wl.lessons_completed, 0) AS lessons_completed,
      COALESCE(wx.xp_earned, 0) AS xp_earned,
      ROW_NUMBER() OVER (
        ORDER BY
          COALESCE(wl.days_studied, 0) DESC,
          COALESCE(wl.lessons_completed, 0) DESC,
          COALESCE(wx.xp_earned, 0) DESC,
          COALESCE(u.current_streak, 0) DESC,
          u.id ASC
      ) AS rank
    FROM active_users u
    LEFT JOIN weekly_lessons wl ON wl.user_id = u.id
    LEFT JOIN weekly_xp wx ON wx.user_id = u.id
  )
  SELECT
    r.user_id,
    r.username,
    r.name,
    r.avatar_url,
    r.level,
    r.total_xp,
    r.current_streak,
    r.days_studied,
    r.lessons_completed,
    r.xp_earned,
    r.rank
  FROM ranked r
  ORDER BY r.rank ASC
  LIMIT p_limit
  OFFSET p_offset;
$$;

REVOKE ALL ON FUNCTION public.get_weekly_leaderboard(timestamptz, int, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_weekly_leaderboard(timestamptz, int, int) TO service_role;

CREATE OR REPLACE FUNCTION public.get_database_size_bytes()
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT pg_database_size(current_database())::bigint;
$$;

REVOKE ALL ON FUNCTION public.get_database_size_bytes() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_database_size_bytes() TO service_role;

-- Covering indexes for weekly leaderboard performance
CREATE INDEX IF NOT EXISTS idx_user_lesson_progress_weekly_completed
  ON public.user_lesson_progress (completed_at DESC, user_id)
  WHERE status = 'completed';

CREATE INDEX IF NOT EXISTS idx_xp_events_weekly_created
  ON public.xp_events (created_at DESC, user_id, xp_amount);
