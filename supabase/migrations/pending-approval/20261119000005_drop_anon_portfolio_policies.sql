-- L1: anonymous visitors cannot read capstone submissions or reflections through PostgREST.
--
-- HELD IN pending-approval/. The Supabase CLI does not read this folder, so nothing here runs on
-- merge. The owner applies it by hand in the Supabase SQL editor.
--
-- APPLY BEFORE 20261113000004_capstone_review_feedback.sql. That migration adds review_feedback,
-- review_scores and review_history to public.capstone_submissions; with the policy below still in
-- place, every reviewer comment on a public capstone would be readable with the anon key.
--
-- Why: "Public can view public capstones" and "Public can view public reflections"
-- (20260728000002_create_user_state.sql:241,248) are SELECT policies with no TO clause, gated only
-- on the row's is_public flag. They expose every column (user_id, full content, status, and after
-- 20261113000004 the review fields) to anyone with the anon key and to every signed-in learner,
-- and they ignore users.is_portfolio_public, so a learner who turned their portfolio private still
-- has every is_public row readable.
--
-- App usage: public portfolios are built server-side with the service role
-- (lib/portfolio-db.ts getPublicPortfolioData via createServiceRoleClient(), which also applies
-- is_portfolio_public). The dashboard, capstone routes, reflections route, lesson pages, settings
-- export and admin pages all use createServiceRoleClient(). No code reads either table with an
-- anon or learner token, so the public policies serve nothing.
--
-- This migration:
--   1. Drops "Public can view public capstones" and "Public can view public reflections".
--   2. REVOKEs SELECT on public.capstone_submissions from PUBLIC and anon (its writes were already
--      revoked in 20261024000002), and ALL on public.reflections from PUBLIC and anon.
--   Learners keep their own-row policies: "Users view own capstones" (SELECT) and
--   "Users manage own reflections" (FOR ALL, own rows).
--
-- Idempotent: DROP POLICY IF EXISTS, REVOKE and the self-check can all be re-run. No data is
-- changed. Nothing here grants anything to anon or authenticated.
-- Rollback: rollback/20261119000005_drop_anon_portfolio_policies.down.sql (next to this file).
-- Validation: validation/20261119000005_drop_anon_portfolio_policies_validation.sql.

SET search_path = public, pg_temp;

DROP POLICY IF EXISTS "Public can view public capstones" ON public.capstone_submissions;
DROP POLICY IF EXISTS "Public can view public reflections" ON public.reflections;

REVOKE SELECT ON public.capstone_submissions FROM PUBLIC, anon;
REVOKE ALL ON public.reflections FROM PUBLIC, anon;

-- ---------------------------------------------------------------------------
-- Self-check
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_role text;
BEGIN
  FOREACH v_role IN ARRAY ARRAY['public', 'anon'] LOOP
    IF has_table_privilege(v_role, 'public.capstone_submissions', 'SELECT, INSERT, UPDATE, DELETE')
       OR has_any_column_privilege(v_role, 'public.capstone_submissions', 'SELECT, INSERT, UPDATE') THEN
      RAISE EXCEPTION '% still holds a privilege on public.capstone_submissions. Look up the grantor in information_schema.role_table_grants and column_privileges, run REVOKE as that role, then apply this migration again.', v_role;
    END IF;
    IF has_table_privilege(v_role, 'public.reflections', 'SELECT, INSERT, UPDATE, DELETE')
       OR has_any_column_privilege(v_role, 'public.reflections', 'SELECT, INSERT, UPDATE') THEN
      RAISE EXCEPTION '% still holds a privilege on public.reflections.', v_role;
    END IF;
  END LOOP;

  IF EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public'
       AND (
         (tablename = 'capstone_submissions' AND policyname = 'Public can view public capstones')
         OR (tablename = 'reflections' AND policyname = 'Public can view public reflections')
       )
  ) THEN
    RAISE EXCEPTION 'A public portfolio policy is still present on capstone_submissions or reflections.';
  END IF;

  -- No remaining SELECT policy on either table may be readable by anon or by everyone.
  IF EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename IN ('capstone_submissions', 'reflections')
       AND cmd IN ('SELECT', 'ALL')
       AND qual NOT LIKE '%auth.uid()%'
  ) THEN
    RAISE EXCEPTION 'A SELECT policy on capstone_submissions or reflections is not limited to the row owner.';
  END IF;

  IF NOT has_table_privilege('service_role', 'public.capstone_submissions', 'SELECT, INSERT, UPDATE')
     OR NOT has_table_privilege('service_role', 'public.reflections', 'SELECT, INSERT, UPDATE') THEN
    RAISE EXCEPTION 'service_role lost access to capstone_submissions or reflections.';
  END IF;
END $$;
