-- Growth R4 / A0 staging validation — privileged user column guard.
--
-- STAGING ONLY. Runs inside one transaction and rolls back, so it leaves no rows behind, but it
-- impersonates the `authenticated` and `anon` roles and must not be pointed at production.
--
-- Usage (after applying 20261010000001_guard_privileged_user_columns.sql on staging):
--   psql "$STAGING_DB_URL" -v ON_ERROR_STOP=1 -v user_id="'<an existing learner uuid>'" \
--     -f supabase/migrations/validation/r4a0_privileged_columns_validation.sql
--
-- Every check raises on failure. Success prints "R4-A0 validation passed".

BEGIN;

-- 1. As the learner (authenticated + matching JWT sub), each privileged column is rejected.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', :user_id, 'role', 'authenticated')::text, true);

DO $$
DECLARE
  v_uid uuid := (current_setting('request.jwt.claims')::json ->> 'sub')::uuid;
  v_col text;
BEGIN
  FOREACH v_col IN ARRAY ARRAY[
    'is_admin = true',
    'is_fellow = true',
    'curriculum_access_override = true',
    $q$portfolio_verification_override = 'verified'$q$
  ] LOOP
    BEGIN
      EXECUTE format('UPDATE public.users SET %s WHERE id = %L', v_col, v_uid);
      RAISE EXCEPTION 'R4-A0 FAILED: learner could run SET %', v_col;
    EXCEPTION WHEN insufficient_privilege THEN
      NULL; -- expected (42501 from the guard)
    END;
  END LOOP;
END $$;

-- 2. An ordinary profile edit still works for the learner.
DO $$
DECLARE
  v_uid uuid := (current_setting('request.jwt.claims')::json ->> 'sub')::uuid;
  v_rows int;
BEGIN
  UPDATE public.users SET name = name WHERE id = v_uid;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN
    RAISE EXCEPTION 'R4-A0 FAILED: ordinary self-update affected % rows', v_rows;
  END IF;
END $$;

-- 3. As the learner, an INSERT that sets a privileged column is rejected by the guard. The
--    learner's own id is used so the row passes the RLS insert check and only the guard (a
--    BEFORE trigger, which runs before RLS WITH CHECK and before constraints) can raise 42501.
--    If authenticated has no INSERT grant on the table at all, that refusal (also 42501) is
--    accepted and reported, as in step 4: the insert never reached the guard, and cannot.
DO $$
DECLARE
  v_uid uuid := (current_setting('request.jwt.claims')::json ->> 'sub')::uuid;
  v_rejected_by text := 'nothing';
BEGIN
  BEGIN
    INSERT INTO public.users (id, is_admin) VALUES (v_uid, true);
  EXCEPTION
    WHEN insufficient_privilege THEN
      v_rejected_by := SQLERRM;
    WHEN others THEN
      v_rejected_by := SQLSTATE || ' ' || SQLERRM;
  END;
  IF v_rejected_by LIKE 'permission denied for%' THEN
    RAISE NOTICE 'R4-A0: authenticated has no INSERT grant on public.users (%); the guard was not reached', v_rejected_by;
  ELSIF v_rejected_by NOT LIKE 'privileged user columns%' THEN
    RAISE EXCEPTION 'R4-A0 FAILED: learner INSERT with is_admin = true was not rejected by the guard (got: %)', v_rejected_by;
  END IF;
END $$;

RESET ROLE;

-- 4. As anon, the same INSERT is rejected. An anon UPDATE matches no row under RLS, so the
--    trigger never fires for it; INSERT is the path that reaches the guard. If anon has no
--    INSERT grant on the table at all, that refusal (also 42501) is accepted and reported.
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);

DO $$
DECLARE
  v_rejected_by text := 'nothing';
BEGIN
  BEGIN
    INSERT INTO public.users (id, is_admin) VALUES (gen_random_uuid(), true);
  EXCEPTION
    WHEN insufficient_privilege THEN
      v_rejected_by := SQLERRM;
    WHEN others THEN
      v_rejected_by := SQLSTATE || ' ' || SQLERRM;
  END;
  IF v_rejected_by LIKE 'permission denied for%' THEN
    RAISE NOTICE 'R4-A0: anon has no INSERT grant on public.users (%); the guard was not reached', v_rejected_by;
  ELSIF v_rejected_by NOT LIKE 'privileged user columns%' THEN
    RAISE EXCEPTION 'R4-A0 FAILED: anon INSERT with is_admin = true was not rejected by the guard (got: %)', v_rejected_by;
  END IF;
END $$;

RESET ROLE;

-- 5. The service role can still grant and revoke.
SET LOCAL ROLE service_role;
UPDATE public.users SET is_fellow = NOT is_fellow WHERE id = :user_id::uuid;
UPDATE public.users SET is_fellow = NOT is_fellow WHERE id = :user_id::uuid;
RESET ROLE;

DO $$ BEGIN RAISE NOTICE 'R4-A0 validation passed'; END $$;

ROLLBACK;
