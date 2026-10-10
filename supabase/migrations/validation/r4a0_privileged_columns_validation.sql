-- Growth R4 / A0 staging validation — privileged user column guard.
--
-- STAGING ONLY. Runs inside one transaction and rolls back, so it leaves no rows behind, but it
-- impersonates the `authenticated` role and must not be pointed at production.
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

RESET ROLE;

-- 3. The service role can still grant and revoke.
SET LOCAL ROLE service_role;
UPDATE public.users SET is_fellow = NOT is_fellow WHERE id = :user_id::uuid;
UPDATE public.users SET is_fellow = NOT is_fellow WHERE id = :user_id::uuid;
RESET ROLE;

DO $$ BEGIN RAISE NOTICE 'R4-A0 validation passed'; END $$;

ROLLBACK;
