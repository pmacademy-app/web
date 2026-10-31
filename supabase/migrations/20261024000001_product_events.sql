-- Phase 2 / PR-05a: server-side product events and the north-star measurement base.
--
-- Closes the base half of PROD-15 from the product report. There is no server-side event
-- stream today: lib/analytics.ts trackEvent is client GA4 only, consent-gated, and cannot answer
-- "how many learners are mastering the material each week". This migration adds:
--
-- 1. public.product_events: one row per product event, written only by the service role through
--    lib/events/product-events.ts trackProductEvent(). event_name is limited by a CHECK to the ten
--    names the app emits; properties must be a JSON object and is capped at 4 KB so a buggy caller
--    cannot bloat the table. user_id cascades on account deletion, so a deleted learner leaves no
--    event trail behind.
--
-- 2. RLS is enabled with no policies, and every privilege is revoked from PUBLIC, anon and
--    authenticated. Supabase's default privileges grant new tables and views to anon and
--    authenticated, so the REVOKEs are required, not decorative. Learners never read or write
--    this table; the service role bypasses RLS.
--
-- 3. Two views for the admin console, also service-role only (security_invoker, so even a
--    future accidental grant would still be filtered by the table's RLS):
--      - weekly_mastering_learners: per ISO week (Monday start, UTC), the distinct learners who
--        completed a lesson with a score of 70 or more, or submitted a capstone. This is the
--        north-star metric shown on the admin overview. The score is read only when it is a
--        JSON number, so a malformed property can never make the view error.
--      - weekly_cohort_retention: signup week (users.created_at, so learners who joined before
--        events existed still have a cohort) by active week (any product event), with the
--        cohort size, for a classic triangle retention chart.
--
-- Idempotent: CREATE ... IF NOT EXISTS, CREATE OR REPLACE VIEW and REVOKE can all be re-run.
-- No existing data is changed. Nothing here grants anything to anon or authenticated.
-- Rollback: rollback/20261024000001_product_events.down.sql.
-- Staging check: validation/20261024000001_product_events_validation.sql.

SET search_path = public, pg_temp;

-- ---------------------------------------------------------------------------
-- 1. Table
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.product_events (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid        REFERENCES public.users(id) ON DELETE CASCADE,
  event_name  text        NOT NULL,
  properties  jsonb       NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT product_events_event_name_chk CHECK (event_name IN (
    'signup',
    'onboarding_completed',
    'lesson_started',
    'lesson_completed',
    'quiz_submitted',
    'capstone_submitted',
    'capstone_reviewed',
    'certificate_issued',
    'portfolio_shared',
    'referral_used'
  )),
  CONSTRAINT product_events_properties_object_chk CHECK (jsonb_typeof(properties) = 'object'),
  CONSTRAINT product_events_properties_size_chk CHECK (pg_column_size(properties) <= 4096)
);

COMMENT ON TABLE public.product_events IS
  'Server-side product events (PROD-15). Service role only; written by lib/events/product-events.ts.';

CREATE INDEX IF NOT EXISTS product_events_event_name_occurred_at_idx
  ON public.product_events (event_name, occurred_at);

CREATE INDEX IF NOT EXISTS product_events_user_id_occurred_at_idx
  ON public.product_events (user_id, occurred_at);

-- ---------------------------------------------------------------------------
-- 2. Lock it down: RLS on, no policies, no end-user privileges
-- ---------------------------------------------------------------------------

ALTER TABLE public.product_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.product_events FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Measurement views (service role only)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE VIEW public.weekly_mastering_learners
WITH (security_invoker = true) AS
SELECT
  date_trunc('week', pe.occurred_at AT TIME ZONE 'UTC')::date AS week_start,
  count(DISTINCT pe.user_id)::bigint                          AS mastering_learners
FROM public.product_events pe
WHERE pe.user_id IS NOT NULL
  AND (
    pe.event_name = 'capstone_submitted'
    OR (
      pe.event_name = 'lesson_completed'
      AND CASE
            WHEN jsonb_typeof(pe.properties -> 'score') = 'number'
              THEN (pe.properties ->> 'score')::numeric
          END >= 70
    )
  )
GROUP BY 1;

COMMENT ON VIEW public.weekly_mastering_learners IS
  'North star: distinct learners per ISO week (UTC) with a lesson_completed score >= 70 or a capstone_submitted event.';

CREATE OR REPLACE VIEW public.weekly_cohort_retention
WITH (security_invoker = true) AS
WITH cohorts AS (
  SELECT u.id AS user_id, date_trunc('week', u.created_at AT TIME ZONE 'UTC')::date AS cohort_week
  FROM public.users u
),
cohort_sizes AS (
  SELECT cohort_week, count(*)::bigint AS cohort_size
  FROM cohorts
  GROUP BY cohort_week
),
activity AS (
  SELECT DISTINCT pe.user_id, date_trunc('week', pe.occurred_at AT TIME ZONE 'UTC')::date AS active_week
  FROM public.product_events pe
  WHERE pe.user_id IS NOT NULL
)
SELECT
  c.cohort_week,
  a.active_week,
  ((a.active_week - c.cohort_week) / 7)::integer AS week_offset,
  s.cohort_size,
  count(DISTINCT a.user_id)::bigint            AS active_learners
FROM cohorts c
JOIN activity a ON a.user_id = c.user_id
JOIN cohort_sizes s ON s.cohort_week = c.cohort_week
WHERE a.active_week >= c.cohort_week
GROUP BY c.cohort_week, a.active_week, s.cohort_size;

COMMENT ON VIEW public.weekly_cohort_retention IS
  'Signup week (users.created_at, UTC ISO week) by active week (any product event), with cohort size.';

REVOKE ALL ON TABLE public.weekly_mastering_learners FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.weekly_cohort_retention FROM PUBLIC, anon, authenticated;

-- Supabase's default privileges already give service_role these; stated here so the migration
-- does not depend on project defaults. The views are security_invoker, so service_role also
-- needs SELECT on the base tables, which it has.
GRANT SELECT, INSERT ON TABLE public.product_events TO service_role;
GRANT SELECT ON TABLE public.weekly_mastering_learners TO service_role;
GRANT SELECT ON TABLE public.weekly_cohort_retention TO service_role;
