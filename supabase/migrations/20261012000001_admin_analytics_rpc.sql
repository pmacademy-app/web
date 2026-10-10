-- Migration: 20261012000001_admin_analytics_rpc.sql
-- Admin R6 B5: move the whole-table analytics reductions into Postgres.
--
-- AnalyticsService.getAnalyticsWorkspaceData used to page entire tables into
-- Node (all users, all xp_events before the range, all completed lessons, all
-- capstone submissions, all certificates, all flashcard SRS rows) and reduce
-- them in JS. These read-only functions return the same aggregates instead.
-- The JS reductions they replace live in
-- apps/web/lib/__tests__/fixtures/analytics-legacy.ts, and
-- admin-analytics-rpc-parity.test.ts checks the two agree.
--
-- All functions are SECURITY INVOKER (service_role bypasses RLS), STABLE, pin
-- search_path, and are executable only by service_role and postgres.
--
-- Indexes: none added. The access paths already exist:
--   xp_events (user_id, created_at)           idx_xp_events_user_created (20260822000001, 20260826000002)
--   user_lesson_progress (status, completed_at) idx_user_lesson_progress_status_completed (20260822000001)
--
-- Deploy order: apply this migration BEFORE deploying the app code that calls
-- these functions. If they are missing, the analytics page renders with
-- `failed` set and zeroed sections instead of erroring.

-- ============================================================================
-- #6 admin_active_users: distinct learners with XP in [p_from, p_to], and
-- whether each had any XP before p_from (new vs returning).
-- Ordered by user_id so PostgREST range paging is stable.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.admin_active_users(p_from timestamptz, p_to timestamptz)
RETURNS TABLE (user_id uuid, active_before boolean)
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT a.user_id,
         EXISTS (
           SELECT 1
           FROM public.xp_events b
           WHERE b.user_id = a.user_id
             AND b.created_at < p_from
         ) AS active_before
  FROM (
    SELECT DISTINCT e.user_id
    FROM public.xp_events e
    WHERE e.user_id IS NOT NULL
      AND e.created_at >= p_from
      AND e.created_at <= p_to
  ) AS a
  ORDER BY a.user_id;
$$;

-- ============================================================================
-- #10 admin_lesson_completion_stats: completed-lesson aggregates.
--   p_modules: [{"slug": text, "lesson_ids": [text, ...]}, ...] in curriculum
--   order (the curriculum lives in static JSON, not in the database).
-- Returns:
--   distinct_users        users with at least one completed lesson
--   completion_histogram  [{lessons, users}]: how many users completed N lessons
--   modules               [{idx, slug, lesson_count, started, completed}], idx is
--                         the 1-based position in p_modules; started = users with
--                         >= 1 completed lesson in the module, completed = users
--                         who completed every lesson in it (0 for an empty module)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.admin_lesson_completion_stats(p_modules jsonb DEFAULT '[]'::jsonb)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  WITH completed AS (
    SELECT p.user_id, p.lesson_id
    FROM public.user_lesson_progress p
    WHERE p.status = 'completed'
  ),
  per_user AS (
    SELECT c.user_id, count(*) AS lessons
    FROM completed c
    GROUP BY c.user_id
  ),
  histogram AS (
    SELECT pu.lessons, count(*) AS users
    FROM per_user pu
    GROUP BY pu.lessons
  ),
  modules AS (
    SELECT m.ord AS idx,
           m.value ->> 'slug' AS slug,
           ARRAY(
             SELECT DISTINCT l.lesson_id
             FROM jsonb_array_elements_text(COALESCE(m.value -> 'lesson_ids', '[]'::jsonb)) AS l(lesson_id)
           ) AS lesson_ids
    FROM jsonb_array_elements(COALESCE(p_modules, '[]'::jsonb)) WITH ORDINALITY AS m(value, ord)
  ),
  module_lessons AS (
    SELECT mo.idx, ml.lesson_id
    FROM modules mo
    CROSS JOIN LATERAL unnest(mo.lesson_ids) AS ml(lesson_id)
  ),
  per_user_module AS (
    SELECT ml.idx, c.user_id, count(DISTINCT c.lesson_id) AS done
    FROM module_lessons ml
    JOIN completed c ON c.lesson_id = ml.lesson_id
    GROUP BY ml.idx, c.user_id
  ),
  module_stats AS (
    SELECT mo.idx,
           mo.slug,
           cardinality(mo.lesson_ids) AS lesson_count,
           count(pum.user_id) AS started,
           count(pum.user_id) FILTER (
             WHERE cardinality(mo.lesson_ids) > 0
               AND pum.done >= cardinality(mo.lesson_ids)
           ) AS completed
    FROM modules mo
    LEFT JOIN per_user_module pum ON pum.idx = mo.idx
    GROUP BY mo.idx, mo.slug, mo.lesson_ids
  )
  SELECT jsonb_build_object(
    'distinct_users', (SELECT count(*) FROM per_user),
    'completion_histogram', COALESCE(
      (SELECT jsonb_agg(jsonb_build_object('lessons', h.lessons, 'users', h.users) ORDER BY h.lessons)
       FROM histogram h),
      '[]'::jsonb
    ),
    'modules', COALESCE(
      (SELECT jsonb_agg(
                jsonb_build_object(
                  'idx', ms.idx,
                  'slug', ms.slug,
                  'lesson_count', ms.lesson_count,
                  'started', ms.started,
                  'completed', ms.completed
                ) ORDER BY ms.idx)
       FROM module_stats ms),
      '[]'::jsonb
    )
  );
$$;

-- ============================================================================
-- #12 admin_capstone_stats: capstone submissions with submitted_at in
-- [p_from, p_to].
--   submitted     all rows in range
--   reviewed      rows in range with status = 'reviewed'
--   submitted_at  timestamps of in-range rows that have a user (daily series)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.admin_capstone_stats(p_from timestamptz, p_to timestamptz)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  WITH in_range AS (
    SELECT c.user_id, c.status, c.submitted_at
    FROM public.capstone_submissions c
    WHERE c.submitted_at IS NOT NULL
      AND c.submitted_at >= p_from
      AND c.submitted_at <= p_to
  )
  SELECT jsonb_build_object(
    'submitted', (SELECT count(*) FROM in_range),
    'reviewed', (SELECT count(*) FROM in_range r WHERE r.status = 'reviewed'),
    'submitted_at', COALESCE(
      (SELECT jsonb_agg(r.submitted_at ORDER BY r.submitted_at)
       FROM in_range r
       WHERE r.user_id IS NOT NULL),
      '[]'::jsonb
    )
  );
$$;

-- ============================================================================
-- #17 admin_flashcard_stats: SRS row count and distinct learners.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.admin_flashcard_stats()
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT jsonb_build_object(
    'total', count(*),
    'distinct_users', count(DISTINCT s.user_id)
  )
  FROM public.user_flashcard_srs s;
$$;

-- ============================================================================
-- #1 admin_user_stats: user total, public portfolios, level and streak
-- distributions.
--   levels   {"1".."5": count}; level is COALESCE(NULLIF(level, 0), 1) clamped to 1..5
--   streaks  [0, 1-3, 4-7, 8-14, 15-30, 30+]; NULL counts as 0, negatives fall
--            in the last bucket (matches STREAK_BUCKETS in analytics-aggregation.ts)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.admin_user_stats()
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  WITH u AS (
    SELECT LEAST(5, GREATEST(1, COALESCE(NULLIF(x.level, 0), 1))) AS lvl,
           COALESCE(x.current_streak, 0) AS streak,
           x.is_portfolio_public
    FROM public.users x
  )
  SELECT jsonb_build_object(
    'total', count(*),
    'public_portfolios', count(*) FILTER (WHERE u.is_portfolio_public IS TRUE),
    'levels', jsonb_build_object(
      '1', count(*) FILTER (WHERE u.lvl = 1),
      '2', count(*) FILTER (WHERE u.lvl = 2),
      '3', count(*) FILTER (WHERE u.lvl = 3),
      '4', count(*) FILTER (WHERE u.lvl = 4),
      '5', count(*) FILTER (WHERE u.lvl = 5)
    ),
    'streaks', jsonb_build_array(
      count(*) FILTER (WHERE u.streak = 0),
      count(*) FILTER (WHERE u.streak BETWEEN 1 AND 3),
      count(*) FILTER (WHERE u.streak BETWEEN 4 AND 7),
      count(*) FILTER (WHERE u.streak BETWEEN 8 AND 14),
      count(*) FILTER (WHERE u.streak BETWEEN 15 AND 30),
      count(*) FILTER (WHERE u.streak > 30 OR u.streak < 0)
    )
  )
  FROM u;
$$;

-- ============================================================================
-- Privileges: admin analytics only, never callable by clients.
-- ============================================================================
REVOKE ALL ON FUNCTION public.admin_active_users(timestamptz, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_lesson_completion_stats(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_capstone_stats(timestamptz, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_flashcard_stats() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_user_stats() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.admin_active_users(timestamptz, timestamptz) TO service_role, postgres;
GRANT EXECUTE ON FUNCTION public.admin_lesson_completion_stats(jsonb) TO service_role, postgres;
GRANT EXECUTE ON FUNCTION public.admin_capstone_stats(timestamptz, timestamptz) TO service_role, postgres;
GRANT EXECUTE ON FUNCTION public.admin_flashcard_stats() TO service_role, postgres;
GRANT EXECUTE ON FUNCTION public.admin_user_stats() TO service_role, postgres;

COMMENT ON FUNCTION public.admin_active_users(timestamptz, timestamptz) IS
  'Admin analytics: distinct XP-active users in a range, with whether each was active before it. Restricted to service_role.';
COMMENT ON FUNCTION public.admin_lesson_completion_stats(jsonb) IS
  'Admin analytics: completed-lesson histogram and per-module started/completed counts. Restricted to service_role.';
COMMENT ON FUNCTION public.admin_capstone_stats(timestamptz, timestamptz) IS
  'Admin analytics: capstone submissions and reviews in a range. Restricted to service_role.';
COMMENT ON FUNCTION public.admin_flashcard_stats() IS
  'Admin analytics: flashcard SRS row count and distinct learners. Restricted to service_role.';
COMMENT ON FUNCTION public.admin_user_stats() IS
  'Admin analytics: user total, public portfolios, level and streak distributions. Restricted to service_role.';
