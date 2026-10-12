-- Migration: 20261013000001_admin_funnel_distinct_users.sql
-- Admin overview funnel: count learners, not rows.
--
-- The "First Lesson", "First Quiz" and "Module Completion" funnel steps were
-- head counts of rows (every completed lesson, every quiz answer, every capstone
-- submission), so a step could exceed "Registered" and show more than 100%.
-- This read-only function returns the number of distinct users behind each
-- step, with the same row filters the funnel used before:
--   first_lesson       users with >= 1 user_lesson_progress row, status = 'completed'
--   first_quiz         users with >= 1 quiz_attempts row
--   module_completion  users with >= 1 capstone_submissions row that has a submitted_at
-- count(DISTINCT user_id) ignores rows whose user_id is NULL.
--
-- SECURITY INVOKER (service_role bypasses RLS), STABLE, pins search_path, and
-- is executable only by service_role and postgres, like the functions in
-- 20261012000001_admin_analytics_rpc.sql.
--
-- Indexes: none added. Each count scans its table once; the user_id indexes
-- from 20260728000002 exist (user_lesson_progress_user_idx,
-- quiz_attempts_user_lesson_idx, capstone_submissions_user_idx).
--
-- Deploy order: apply this migration BEFORE deploying the app code that calls
-- it. If it is missing, the overview funnel renders its load warning (`failed`,
-- not cached) and the rest of the overview is unaffected.

CREATE OR REPLACE FUNCTION public.admin_funnel_distinct_users()
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT jsonb_build_object(
    'first_lesson',
      (SELECT count(DISTINCT p.user_id) FROM public.user_lesson_progress p WHERE p.status = 'completed'),
    'first_quiz',
      (SELECT count(DISTINCT q.user_id) FROM public.quiz_attempts q),
    'module_completion',
      (SELECT count(DISTINCT c.user_id) FROM public.capstone_submissions c WHERE c.submitted_at IS NOT NULL)
  );
$$;

-- ============================================================================
-- Privileges: admin analytics only, never callable by clients.
-- ============================================================================
REVOKE ALL ON FUNCTION public.admin_funnel_distinct_users() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.admin_funnel_distinct_users() TO service_role, postgres;

COMMENT ON FUNCTION public.admin_funnel_distinct_users() IS
  'Admin overview funnel: distinct users with a completed lesson, a quiz attempt, and a submitted capstone. Restricted to service_role.';
