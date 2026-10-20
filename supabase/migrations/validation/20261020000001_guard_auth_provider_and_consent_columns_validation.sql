-- Staging validation for 20261020000001: auth_provider and consent column guard.
--
-- STAGING ONLY. Runs inside one transaction and rolls back, so it leaves no rows behind, but it
-- impersonates the `authenticated` and `anon` roles and must not be pointed at production.
--
-- Usage (after applying 20261020000001_guard_auth_provider_and_consent_columns.sql on staging):
--   psql "$STAGING_DB_URL" -v ON_ERROR_STOP=1 -v user_id="'<an existing learner uuid>'" \
--     -f supabase/migrations/validation/20261020000001_guard_auth_provider_and_consent_columns_validation.sql
--
-- Every check raises on failure. Success prints "20261020000001 validation passed".

BEGIN;

-- 1. As the learner (authenticated + matching JWT sub), every guarded column change is rejected,
--    including the columns guarded before this migration.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', :user_id, 'role', 'authenticated')::text, true);

DO $$
DECLARE
  v_uid uuid := (current_setting('request.jwt.claims')::json ->> 'sub')::uuid;
  v_col text;
BEGIN
  FOREACH v_col IN ARRAY ARRAY[
    $q$auth_provider = CASE WHEN auth_provider = 'google' THEN 'email' ELSE 'google' END$q$,
    $q$terms_accepted_at = coalesce(terms_accepted_at, now()) + interval '1 second'$q$,
    $q$terms_version = coalesce(terms_version, '') || 'x'$q$,
    $q$privacy_version = coalesce(privacy_version, '') || 'x'$q$,
    $q$age_confirmed_at = coalesce(age_confirmed_at, now()) + interval '1 second'$q$,
    $q$age_confirmed_minimum = coalesce(age_confirmed_minimum, 0) + 1$q$,
    'is_admin = true',
    'is_fellow = true',
    'curriculum_access_override = true',
    $q$portfolio_verification_override = 'verified'$q$,
    $q$email = 'forged-' || email$q$
  ] LOOP
    BEGIN
      EXECUTE format('UPDATE public.users SET %s WHERE id = %L', v_col, v_uid);
      RAISE EXCEPTION '20261020000001 FAILED: learner could run SET %', v_col;
    EXCEPTION WHEN insufficient_privilege THEN
      NULL; -- expected (42501 from the guard)
    END;
  END LOOP;
END $$;

-- 2. An ordinary profile edit, and a no-op write of a guarded column, still work for the learner.
DO $$
DECLARE
  v_uid uuid := (current_setting('request.jwt.claims')::json ->> 'sub')::uuid;
  v_rows int;
BEGIN
  UPDATE public.users SET name = name, terms_accepted_at = terms_accepted_at WHERE id = v_uid;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN
    RAISE EXCEPTION '20261020000001 FAILED: ordinary self-update affected % rows', v_rows;
  END IF;
END $$;

-- 3. As the learner, an INSERT that sets a consent column or a non-default provider is rejected
--    by the guard. If authenticated has no INSERT grant on the table at all, that refusal (also
--    42501) is accepted and reported: the insert never reached the guard, and cannot.
DO $$
DECLARE
  v_uid uuid := (current_setting('request.jwt.claims')::json ->> 'sub')::uuid;
  v_values text;
  v_rejected_by text;
BEGIN
  FOREACH v_values IN ARRAY ARRAY[
    $q$(id, auth_provider) VALUES (%L, 'google')$q$,
    $q$(id, terms_accepted_at) VALUES (%L, now())$q$,
    $q$(id, age_confirmed_minimum) VALUES (%L, 18)$q$
  ] LOOP
    v_rejected_by := 'nothing';
    BEGIN
      EXECUTE format('INSERT INTO public.users ' || v_values, v_uid);
    EXCEPTION
      WHEN insufficient_privilege THEN
        v_rejected_by := SQLERRM;
      WHEN others THEN
        v_rejected_by := SQLSTATE || ' ' || SQLERRM;
    END;
    IF v_rejected_by LIKE 'permission denied for%' THEN
      RAISE NOTICE '20261020000001: authenticated has no INSERT grant on public.users (%); the guard was not reached', v_rejected_by;
    ELSIF v_rejected_by NOT LIKE 'auth provider and consent columns%' THEN
      RAISE EXCEPTION '20261020000001 FAILED: learner INSERT % was not rejected by the guard (got: %)', v_values, v_rejected_by;
    END IF;
  END LOOP;
END $$;

RESET ROLE;

-- 4. As anon, the same INSERT is rejected (an anon UPDATE matches no row under RLS, so the
--    trigger never fires for it). A missing INSERT grant is accepted and reported.
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);

DO $$
DECLARE
  v_rejected_by text := 'nothing';
BEGIN
  BEGIN
    INSERT INTO public.users (id, terms_accepted_at) VALUES (gen_random_uuid(), now());
  EXCEPTION
    WHEN insufficient_privilege THEN
      v_rejected_by := SQLERRM;
    WHEN others THEN
      v_rejected_by := SQLSTATE || ' ' || SQLERRM;
  END;
  IF v_rejected_by LIKE 'permission denied for%' THEN
    RAISE NOTICE '20261020000001: anon has no INSERT grant on public.users (%); the guard was not reached', v_rejected_by;
  ELSIF v_rejected_by NOT LIKE 'auth provider and consent columns%' THEN
    RAISE EXCEPTION '20261020000001 FAILED: anon INSERT with terms_accepted_at was not rejected by the guard (got: %)', v_rejected_by;
  END IF;
END $$;

RESET ROLE;

-- 5. The service role can still write consent and provider (as complete-consent and the OAuth
--    callback do). Values are restored by the ROLLBACK below.
SET LOCAL ROLE service_role;
UPDATE public.users
   SET auth_provider = 'google',
       terms_accepted_at = now(),
       terms_version = 'validation',
       privacy_version = 'validation',
       age_confirmed_at = now(),
       age_confirmed_minimum = 18
 WHERE id = :user_id::uuid;
RESET ROLE;

DO $$ BEGIN RAISE NOTICE '20261020000001 validation passed'; END $$;

ROLLBACK;
