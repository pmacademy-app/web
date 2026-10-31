-- Staging validation for 20261024000002: capstone_submissions client write lockdown.
--
-- STAGING ONLY. Runs inside one transaction and rolls back, so it leaves no rows behind, but it
-- impersonates the `authenticated` and `anon` roles and must not be pointed at production.
--
-- Usage (after applying 20261024000002_lock_users_and_capstone_client_writes.sql on staging):
--   psql "$STAGING_DB_URL" -v ON_ERROR_STOP=1 -v user_id="'<an existing learner uuid>'" \
--     -f supabase/migrations/validation/20261024000002_lock_users_and_capstone_client_writes_validation.sql
--
-- Every check raises on failure. Success prints "20261024000002 validation passed".

BEGIN;

-- 0. No client-facing role holds a write privilege: not anon, not authenticated, and not
--    PUBLIC (which every role inherits). 'public' is the PUBLIC pseudo-role in these functions.
DO $$
DECLARE
  v_role text;
BEGIN
  FOREACH v_role IN ARRAY ARRAY['public', 'anon', 'authenticated'] LOOP
    IF has_table_privilege(v_role, 'public.capstone_submissions', 'INSERT')
       OR has_table_privilege(v_role, 'public.capstone_submissions', 'UPDATE')
       OR has_table_privilege(v_role, 'public.capstone_submissions', 'DELETE')
       OR has_any_column_privilege(v_role, 'public.capstone_submissions', 'INSERT, UPDATE') THEN
      RAISE EXCEPTION '20261024000002 FAILED: % still holds a write privilege on capstone_submissions', v_role;
    END IF;
  END LOOP;
END $$;

-- 1. As the learner (authenticated + matching JWT sub), INSERT, UPDATE and DELETE on their own
--    capstone rows are refused with insufficient_privilege, and an own-row SELECT still works.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', :user_id, 'role', 'authenticated')::text, true);

DO $$
DECLARE
  v_uid uuid := (current_setting('request.jwt.claims')::json ->> 'sub')::uuid;
  v_stmt text;
  v_rows int;
BEGIN
  FOREACH v_stmt IN ARRAY ARRAY[
    format($q$INSERT INTO public.capstone_submissions (user_id, module_slug) VALUES (%L, 'foundations')$q$, v_uid),
    format($q$UPDATE public.capstone_submissions SET status = status WHERE user_id = %L$q$, v_uid),
    format($q$DELETE FROM public.capstone_submissions WHERE user_id = %L$q$, v_uid)
  ] LOOP
    BEGIN
      EXECUTE v_stmt;
      RAISE EXCEPTION '20261024000002 FAILED: learner could run %', v_stmt;
    EXCEPTION WHEN insufficient_privilege THEN
      NULL; -- expected (permission denied for table capstone_submissions)
    END;
  END LOOP;

  SELECT count(*) INTO v_rows FROM public.capstone_submissions WHERE user_id = v_uid;
  RAISE NOTICE '20261024000002: learner can read % own capstone row(s)', v_rows;
END $$;

RESET ROLE;

-- 2. As anon, INSERT is refused.
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);

DO $$
BEGIN
  BEGIN
    INSERT INTO public.capstone_submissions (user_id, module_slug) VALUES (gen_random_uuid(), 'foundations');
    RAISE EXCEPTION '20261024000002 FAILED: anon could insert into capstone_submissions';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL; -- expected
  END;
END $$;

RESET ROLE;

-- 3. The service role can still write (as the submit route and moderation do). Rolled back below.
SET LOCAL ROLE service_role;
UPDATE public.capstone_submissions SET status = status WHERE user_id = :user_id::uuid;
RESET ROLE;

DO $$ BEGIN RAISE NOTICE '20261024000002 validation passed'; END $$;

ROLLBACK;
