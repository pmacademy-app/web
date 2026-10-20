-- Phase 1 / PR-01: lock down database permissions that the public anon key could reach.
--
-- Closes SEC-01, SEC-02, SEC-03, SEC-05, SEC-06 and SEC-22 from the security report.
--
-- 1. SEC-01. public.sync_user_xp and public.record_lesson_quiz_completion are SECURITY DEFINER
--    and 20260925000002_phase_t2_backend_reliability.sql granted them to `authenticated`, so any
--    signed-in learner could rewrite their own XP or record a quiz result for any lesson and
--    user id. The only caller is the quiz route, through the service-role client
--    (app/api/v2/lessons/[lessonId]/quiz/route.ts -> lib/academy/lessons-db.ts:244). Nothing in
--    the app calls sync_user_xp. Both become service-role only, and sync_user_xp gets a pinned
--    search_path (the quiz RPC already has one).
--
-- 2. SEC-22. The XP trigger functions update_user_xp_and_level() and
--    sync_user_xp_and_level_on_update() were re-created as SECURITY DEFINER in 20260925000002
--    without a search_path. Re-pin it.
--
-- 3. SEC-02. public.public_profiles (20260910000001_security_hardening_b1.sql) is a plain view
--    owned by postgres, granted to anon. It runs with the owner's rights, so it skips RLS on
--    public.users. No app code reads it (public portfolios are served server-side with the
--    service role) and it is not in types/database.ts. Drop it.
--
-- 4. SEC-03 / SEC-06. "Service role has full access to ..." policies on email_broadcasts and
--    fellow_requests are FOR ALL with no TO clause and USING (true), so they apply to every role,
--    not the service role (which bypasses RLS and never needed them). Anyone with the anon key
--    could read, write or delete broadcasts and fellow requests. Every reader and writer uses
--    the service-role client (lib/admin/broadcast-service.ts, the campaign runner,
--    lib/fellow-requests-db.ts, lib/admin/fellow-request-service.ts,
--    lib/dashboard/proof-extras-db.ts, lib/growth/proof-state-db.ts). Drop the policies and
--    revoke table privileges from the end-user roles. The learner own-row policies on
--    fellow_requests (20260905000001:37-44, "Users can view own fellow requests" and "Users can
--    submit own fellow requests") stay in place but become inert, because learners no longer
--    hold any privilege on the table.
--
-- 5. SEC-05. testimonials "Users can submit feedback" let a learner INSERT rows directly,
--    including is_published = true, skipping moderation. The API inserts with the service role
--    (app/api/testimonials/route.ts:59). Drop the policy. The two SELECT policies stay.
--
-- 6. Functions postgres creates from now on start closed: no EXECUTE for PUBLIC, anon or
--    authenticated unless a migration grants it. This only covers functions created by the
--    postgres role, not ones created by supabase_admin. The per-schema form only reverses the
--    per-schema grant Supabase sets up for anon and authenticated; the built-in EXECUTE for
--    PUBLIC is a global default, which Postgres does not let a per-schema REVOKE remove, so the
--    global form is needed too.
--
--    NOTE FOR FUTURE MIGRATIONS: new functions start closed. If a function is meant to be
--    learner-callable (or is used inside an RLS policy), GRANT EXECUTE on it explicitly to anon
--    and/or authenticated in the same migration, and if it is SECURITY DEFINER register it in the
--    `allowlist` of validation/20261018000001_lockdown_validation.sql with a comment. Rollback:
--    rollback/20261018000001_lockdown_public_grants.down.sql reverses only this default.
--
-- Idempotent: REVOKE, ALTER FUNCTION ... SET, DROP ... IF EXISTS and ALTER DEFAULT PRIVILEGES
-- can all be re-run. No data is changed. Nothing here grants anything to anon or authenticated.

SET search_path = public, pg_temp;

-- ---------------------------------------------------------------------------
-- 1. Learner-callable SECURITY DEFINER RPCs: service role only (SEC-01)
-- ---------------------------------------------------------------------------

REVOKE ALL ON FUNCTION public.sync_user_xp(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sync_user_xp(uuid) TO service_role;
ALTER FUNCTION public.sync_user_xp(uuid) SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION public.record_lesson_quiz_completion(uuid, text, int, int, int, jsonb, int, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_lesson_quiz_completion(uuid, text, int, int, int, jsonb, int, int) TO service_role;

-- ---------------------------------------------------------------------------
-- 2. Re-pin search_path on the XP trigger functions (SEC-22)
-- ---------------------------------------------------------------------------

ALTER FUNCTION public.update_user_xp_and_level() SET search_path = public, pg_temp;
ALTER FUNCTION public.sync_user_xp_and_level_on_update() SET search_path = public, pg_temp;

-- ---------------------------------------------------------------------------
-- 3. Drop the RLS-bypassing public profile view (SEC-02)
-- ---------------------------------------------------------------------------

DROP VIEW IF EXISTS public.public_profiles;

-- ---------------------------------------------------------------------------
-- 4. email_broadcasts and fellow_requests: no access for end-user roles (SEC-03, SEC-06)
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "Service role has full access to email_broadcasts" ON public.email_broadcasts;
DROP POLICY IF EXISTS "Service role has full access to fellow_requests" ON public.fellow_requests;

REVOKE ALL ON public.email_broadcasts FROM anon, authenticated;
REVOKE ALL ON public.fellow_requests FROM anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. testimonials: learners cannot insert directly (SEC-05)
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "Users can submit feedback" ON public.testimonials;

-- ---------------------------------------------------------------------------
-- 6. Future functions created by postgres start closed
-- ---------------------------------------------------------------------------

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

-- ---------------------------------------------------------------------------
-- 7. Self-check
-- ---------------------------------------------------------------------------
-- REVOKE only removes privileges given by the role running it and says nothing when a grant
-- made by another role stays in place. So check the result rather than trust the statements
-- above. Read-only, so the migration stays re-runnable.
DO $$
DECLARE
  v_role text;
  v_fn text;
  v_table text;
BEGIN
  FOREACH v_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    FOREACH v_fn IN ARRAY ARRAY[
      'public.sync_user_xp(uuid)',
      'public.record_lesson_quiz_completion(uuid, text, integer, integer, integer, jsonb, integer, integer)'
    ] LOOP
      IF has_function_privilege(v_role, v_fn, 'EXECUTE') THEN
        RAISE EXCEPTION '% can still EXECUTE %. Look up the grantor in information_schema.routine_privileges (also check PUBLIC), run REVOKE as that role, then apply this migration again.', v_role, v_fn;
      END IF;
    END LOOP;

    FOREACH v_table IN ARRAY ARRAY['public.email_broadcasts', 'public.fellow_requests'] LOOP
      IF has_table_privilege(v_role, v_table, 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER') THEN
        RAISE EXCEPTION '% still holds a privilege on %. Look up the grantor in information_schema.role_table_grants (also check PUBLIC), run REVOKE as that role, then apply this migration again.', v_role, v_table;
      END IF;
    END LOOP;
  END LOOP;

  IF to_regclass('public.public_profiles') IS NOT NULL THEN
    RAISE EXCEPTION 'public.public_profiles still exists after DROP VIEW IF EXISTS. Check whether it is now a table or materialized view and drop it by hand.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND (
        (tablename = 'testimonials' AND policyname = 'Users can submit feedback')
        OR (tablename = 'email_broadcasts' AND policyname = 'Service role has full access to email_broadcasts')
        OR (tablename = 'fellow_requests' AND policyname = 'Service role has full access to fellow_requests')
      )
  ) THEN
    RAISE EXCEPTION 'A policy this migration drops is still present on testimonials, email_broadcasts or fellow_requests.';
  END IF;
END $$;
