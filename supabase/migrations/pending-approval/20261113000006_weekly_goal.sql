-- Migration: 20261113000006_weekly_goal.sql
-- Goal: Learner weekly goal and outcome-based weekly recap (PROD-06, PROD-13a, AG-29)
--
-- Why:
-- Streaks reward opening the app, not progress. A weekly goal (e.g. 3 lessons a week, 20-minute sessions)
-- and a recap that reports against it gives learners a substantive progress metric.

SET search_path = public, pg_temp;

-- 1. Add weekly_goal_lessons and session_minutes columns to public.users
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS weekly_goal_lessons smallint,
  ADD COLUMN IF NOT EXISTS session_minutes smallint;

-- 2. Add check constraints
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'users_weekly_goal_lessons_check'
  ) THEN
    ALTER TABLE public.users
      ADD CONSTRAINT users_weekly_goal_lessons_check
      CHECK (weekly_goal_lessons IS NULL OR (weekly_goal_lessons >= 1 AND weekly_goal_lessons <= 7));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'users_session_minutes_check'
  ) THEN
    ALTER TABLE public.users
      ADD CONSTRAINT users_session_minutes_check
      CHECK (session_minutes IS NULL OR session_minutes IN (10, 15, 20, 30, 45, 60));
  END IF;
END $$;
