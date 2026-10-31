-- Phase 2 / PR-06 (SEC-07), part 1: learners cannot write public.capstone_submissions through
-- PostgREST.
--
-- "Users manage own capstones" (20260728000002_create_user_state.sql:247) is FOR ALL, so a
-- signed-in learner could insert, edit or delete their own submission with the anon key,
-- skipping the submit route's checks, its status rules and the review loop's status. Every
-- writer uses a service-role client that never signs a user in: lib/capstones-db.ts through the
-- capstone routes, and lib/admin/moderation-service.ts. No app code reads the table with a
-- learner token either (the dashboard uses the service role), but an own-row read is harmless,
-- so the policy is replaced by a SELECT-only own-row policy, and INSERT, UPDATE and DELETE are
-- revoked from PUBLIC, anon and authenticated. PUBLIC is named too: every role inherits a grant
-- made to PUBLIC, so a stray one would survive a revoke from the two named roles alone.
-- "Public can view public capstones" is unchanged.
--
-- public.users is NOT changed here, although the file name covers it. The pre-check for this
-- task found learner-token writes to public.users: app/api/auth/login/route.ts and the
-- token_hash path of app/api/auth/callback/route.ts call signInWithPassword / verifyOtp on a
-- createServiceRoleClient() instance and then write public.users through that same client.
-- supabase-js sends the signed-in session's access token on every later PostgREST call, so
-- those writes run as `authenticated`. Revoking INSERT/UPDATE on public.users (or turning the
-- column guard into an allow-list) has to wait until those routes write through a client that
-- holds no user session.
--
-- Idempotent: DROP POLICY IF EXISTS, CREATE POLICY after the drop, REVOKE and the self-check can
-- all be re-run. No data is changed. Nothing here grants anything to anon or authenticated.

SET search_path = public, pg_temp;

-- ---------------------------------------------------------------------------
-- 1. public.capstone_submissions: learners read their own rows, nothing more
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "Users manage own capstones" ON public.capstone_submissions;
DROP POLICY IF EXISTS "Users view own capstones" ON public.capstone_submissions;

CREATE POLICY "Users view own capstones"
  ON public.capstone_submissions FOR SELECT
  USING (auth.uid() = user_id);

REVOKE INSERT, UPDATE, DELETE ON public.capstone_submissions FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Self-check
-- ---------------------------------------------------------------------------
-- REVOKE says nothing when a grant made by another role stays in place, and a column-level
-- grant made by a different grantor survives a table-level REVOKE. Check the result instead.
DO $$
DECLARE
  v_role text;
BEGIN
  -- 'public' is the PUBLIC pseudo-role in the privilege inquiry functions.
  FOREACH v_role IN ARRAY ARRAY['public', 'anon', 'authenticated'] LOOP
    IF has_table_privilege(v_role, 'public.capstone_submissions', 'INSERT, UPDATE, DELETE')
       OR has_any_column_privilege(v_role, 'public.capstone_submissions', 'INSERT, UPDATE') THEN
      RAISE EXCEPTION '% can still write public.capstone_submissions. Look up the grantor in information_schema.role_table_grants and column_privileges, run REVOKE as that role, then apply this migration again.', v_role;
    END IF;
  END LOOP;

  IF EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename = 'capstone_submissions'
       AND policyname = 'Users manage own capstones'
  ) THEN
    RAISE EXCEPTION 'The "Users manage own capstones" policy is still present on capstone_submissions.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename = 'capstone_submissions'
       AND policyname = 'Users view own capstones'
       AND cmd = 'SELECT'
  ) THEN
    RAISE EXCEPTION 'The "Users view own capstones" SELECT policy is missing on capstone_submissions.';
  END IF;
END $$;
