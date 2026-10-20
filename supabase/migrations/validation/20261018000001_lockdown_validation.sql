-- Phase 1 / PR-01 validation (staging, then production), lock down database permissions.
--
-- Transactional: everything runs inside one BEGIN ... ROLLBACK, so it leaves nothing behind.
-- The probe function it creates and every probe it runs as `anon` and `authenticated` are
-- refused or rolled back, and no row is kept. It is safe to run on staging first and then on
-- production, which is what the plan's "Done when" for PR-01 asks for (the validation script
-- passes on production).
--
-- Usage (after applying 20261018000001_lockdown_public_grants.sql), as postgres, staging first:
--   psql "$STAGING_DB_URL" -v ON_ERROR_STOP=1 \
--     -f supabase/migrations/validation/20261018000001_lockdown_validation.sql
--   psql "$PRODUCTION_DB_URL" -v ON_ERROR_STOP=1 \
--     -f supabase/migrations/validation/20261018000001_lockdown_validation.sql
-- The pre-deploy evidence and post-deploy forensics live in
-- validation/20261018000001_forensics.sql.
--
-- Every check raises on failure. Success prints "PR-01 lockdown validation passed".

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. The plan's three queries, with assertions
-- ---------------------------------------------------------------------------

-- 1a. No SECURITY DEFINER function in public is executable by anon or authenticated, except
--     an explicit allowlist. Trigger functions are skipped: Postgres refuses to call them
--     outside a trigger, so EXECUTE on them gives nothing to the caller.
DO $$
DECLARE
  -- Functions that a repo migration intentionally grants to anon or authenticated, one comment
  -- per entry. As of 20261018000001 no migration does, so the list is empty. Add an entry only
  -- together with the migration that grants it.
  allowlist text[] := ARRAY[]::text[];
  r record;
  v_bad text[] := ARRAY[]::text[];
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure::text AS sig,
           has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_exec,
           has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth_exec
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef
      AND p.prorettype NOT IN ('trigger'::regtype, 'event_trigger'::regtype)
    ORDER BY 1
  LOOP
    RAISE NOTICE 'security definer %: anon_exec=%, auth_exec=%', r.sig, r.anon_exec, r.auth_exec;
    IF (r.anon_exec OR r.auth_exec) AND NOT (r.sig = ANY (allowlist)) THEN
      v_bad := v_bad || r.sig;
    END IF;
  END LOOP;

  IF array_length(v_bad, 1) IS NOT NULL THEN
    RAISE EXCEPTION 'PR-01 FAILED: SECURITY DEFINER functions executable by anon or authenticated and not allowlisted: %', v_bad;
  END IF;
END $$;

-- 1b. public_profiles is gone, so nobody holds a privilege on it.
DO $$
DECLARE
  v_count int;
BEGIN
  SELECT count(*) INTO v_count
  FROM information_schema.role_table_grants
  WHERE table_schema = 'public' AND table_name = 'public_profiles';
  IF v_count > 0 OR to_regclass('public.public_profiles') IS NOT NULL THEN
    RAISE EXCEPTION 'PR-01 FAILED: public.public_profiles still exists (% grants)', v_count;
  END IF;
END $$;

-- 1c. Policies that apply to every role with USING (true). None may sit on email_broadcasts
--     or fellow_requests, and none may allow writes. Read-only ones elsewhere (for example
--     leaderboard snapshots and public cohorts) are reported for review, not failed.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT tablename, policyname, cmd
    FROM pg_policies
    WHERE schemaname = 'public' AND roles = '{public}' AND qual = 'true'
    ORDER BY tablename, policyname
  LOOP
    IF r.tablename IN ('email_broadcasts', 'fellow_requests') THEN
      RAISE EXCEPTION 'PR-01 FAILED: open policy % is still on public.%', r.policyname, r.tablename;
    ELSIF r.cmd <> 'SELECT' THEN
      RAISE EXCEPTION 'PR-01 FAILED: open % policy % on public.% lets every role write', r.cmd, r.policyname, r.tablename;
    ELSE
      RAISE NOTICE 'open read policy (review): public.% / %', r.tablename, r.policyname;
    END IF;
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 2. testimonials has no learner INSERT policy
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'testimonials' AND cmd IN ('INSERT', 'ALL')
  ) THEN
    RAISE EXCEPTION 'PR-01 FAILED: public.testimonials still has an INSERT or ALL policy, so learners may insert directly';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 3. search_path is pinned on the four functions this migration covers
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_fn regprocedure;
  v_config text[];
BEGIN
  FOREACH v_fn IN ARRAY ARRAY[
    'public.sync_user_xp(uuid)'::regprocedure,
    'public.record_lesson_quiz_completion(uuid, text, integer, integer, integer, jsonb, integer, integer)'::regprocedure,
    'public.update_user_xp_and_level()'::regprocedure,
    'public.sync_user_xp_and_level_on_update()'::regprocedure
  ] LOOP
    SELECT proconfig INTO v_config FROM pg_proc WHERE oid = v_fn;
    IF v_config IS NULL OR NOT EXISTS (
      SELECT 1 FROM unnest(v_config) AS c WHERE c LIKE 'search_path=%'
    ) THEN
      RAISE EXCEPTION 'PR-01 FAILED: % has no pinned search_path (proconfig = %)', v_fn, v_config;
    END IF;
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 4. A function postgres creates now starts closed (default privileges)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF current_user <> 'postgres' THEN
    RAISE NOTICE 'PR-01: connected as %, not postgres; default-privilege probe skipped', current_user;
    RETURN;
  END IF;

  CREATE FUNCTION public.pr01_default_acl_probe() RETURNS int LANGUAGE sql AS 'SELECT 1';
  IF has_function_privilege('anon', 'public.pr01_default_acl_probe()', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.pr01_default_acl_probe()', 'EXECUTE') THEN
    RAISE EXCEPTION 'PR-01 FAILED: a new function in public is executable by anon or authenticated by default';
  END IF;
  IF NOT has_function_privilege('service_role', 'public.pr01_default_acl_probe()', 'EXECUTE') THEN
    RAISE NOTICE 'PR-01: service_role has no default EXECUTE on new public functions; new migrations must grant it explicitly';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 5. As anon and as authenticated, the RPCs and tables are refused
-- ---------------------------------------------------------------------------
-- Every probe must fail with insufficient_privilege (42501). Succeeding, or failing with any
-- other error, means the role got past the privilege check.

SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);

DO $$
DECLARE
  v_probe text;
  v_result text;
BEGIN
  FOREACH v_probe IN ARRAY ARRAY[
    'SELECT public.sync_user_xp(gen_random_uuid())',
    $q$SELECT public.record_lesson_quiz_completion(gen_random_uuid(), 'pr01-probe', 100, 1, 1, '[]'::jsonb)$q$,
    'SELECT 1 FROM public.email_broadcasts LIMIT 1',
    'SELECT 1 FROM public.fellow_requests LIMIT 1',
    $q$INSERT INTO public.testimonials (user_id, source_event, content) VALUES (NULL, 'general', 'pr01-probe')$q$
  ] LOOP
    v_result := 'succeeded';
    BEGIN
      EXECUTE v_probe;
    EXCEPTION
      WHEN insufficient_privilege THEN
        v_result := 'refused';
      WHEN others THEN
        v_result := SQLSTATE || ' ' || SQLERRM;
    END;
    IF v_result <> 'refused' THEN
      RAISE EXCEPTION 'PR-01 FAILED: as anon, "%" was not refused (got: %)', v_probe, v_result;
    END IF;
  END LOOP;
END $$;

RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid(), 'role', 'authenticated')::text, true);

DO $$
DECLARE
  v_probe text;
  v_result text;
BEGIN
  FOREACH v_probe IN ARRAY ARRAY[
    'SELECT public.sync_user_xp(gen_random_uuid())',
    $q$SELECT public.record_lesson_quiz_completion(gen_random_uuid(), 'pr01-probe', 100, 1, 1, '[]'::jsonb)$q$,
    'SELECT 1 FROM public.email_broadcasts LIMIT 1',
    'SELECT 1 FROM public.fellow_requests LIMIT 1',
    $q$INSERT INTO public.testimonials (user_id, source_event, content) VALUES (NULL, 'general', 'pr01-probe')$q$
  ] LOOP
    v_result := 'succeeded';
    BEGIN
      EXECUTE v_probe;
    EXCEPTION
      WHEN insufficient_privilege THEN
        v_result := 'refused';
      WHEN others THEN
        v_result := SQLSTATE || ' ' || SQLERRM;
    END;
    IF v_result <> 'refused' THEN
      RAISE EXCEPTION 'PR-01 FAILED: as authenticated, "%" was not refused (got: %)', v_probe, v_result;
    END IF;
  END LOOP;
END $$;

RESET ROLE;

-- 6. The service role can still call sync_user_xp and read the locked tables. (The quiz RPC is
--    covered end to end by completing one lesson with a test account, per the plan.)
SET LOCAL ROLE service_role;
SELECT public.sync_user_xp(gen_random_uuid());
SELECT count(*) FROM public.email_broadcasts;
SELECT count(*) FROM public.fellow_requests;
RESET ROLE;

DO $$ BEGIN RAISE NOTICE 'PR-01 lockdown validation passed'; END $$;

ROLLBACK;
