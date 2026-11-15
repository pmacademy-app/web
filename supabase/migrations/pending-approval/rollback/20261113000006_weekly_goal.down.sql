-- Rollback for 20261113000006: Learner weekly goal and session minutes.

SET search_path = public, pg_temp;

ALTER TABLE public.users
  DROP CONSTRAINT IF EXISTS users_weekly_goal_lessons_check,
  DROP CONSTRAINT IF EXISTS users_session_minutes_check,
  DROP COLUMN IF EXISTS weekly_goal_lessons,
  DROP COLUMN IF EXISTS session_minutes;
