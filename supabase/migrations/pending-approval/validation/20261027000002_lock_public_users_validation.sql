-- Staging validation for 20261027000002: public.users client write lockdown (T29 / SEC-07).
--
-- STAGING ONLY. Runs inside one transaction and rolls back, so it leaves no rows, roles or
-- policies behind, but it impersonates `authenticated`, `anon` and `service_role`, creates a
-- throwaway role and policy, and briefly locks public.users. Do not point it at production.
--
-- Usage (after applying 20261027000002_lock_public_users.sql on staging, as postgres):
--   psql "$STAGING_DB_URL" -v ON_ERROR_STOP=1 -v user_id="'<an existing learner uuid>'" \
--     -f supabase/migrations/pending-approval/validation/20261027000002_lock_public_users_validation.sql
--
-- Every check raises on failure. Success prints "20261027000002 validation passed".

BEGIN;

-- 1. Privileges, as the catalog reports them.
DO $$
DECLARE
  v_role text;
BEGIN
  FOREACH v_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF has_table_privilege(v_role, 'public.users', 'INSERT') THEN
      RAISE EXCEPTION '20261027000002 FAILED: % has INSERT on public.users', v_role;
    END IF;
    IF has_table_privilege(v_role, 'public.users', 'UPDATE') THEN
      RAISE EXCEPTION '20261027000002 FAILED: % has UPDATE on public.users', v_role;
    END IF;
    IF has_table_privilege(v_role, 'public.users', 'DELETE') THEN
      RAISE EXCEPTION '20261027000002 FAILED: % has DELETE on public.users', v_role;
    END IF;
    IF has_any_column_privilege(v_role, 'public.users', 'INSERT, UPDATE') THEN
      RAISE EXCEPTION '20261027000002 FAILED: % has a column-level INSERT or UPDATE grant on public.users', v_role;
    END IF;
  END LOOP;

  IF NOT has_table_privilege('authenticated', 'public.users', 'SELECT') THEN
    RAISE EXCEPTION '20261027000002 FAILED: authenticated lost SELECT on public.users';
  END IF;

  IF NOT has_table_privilege('service_role', 'public.users', 'SELECT, INSERT, UPDATE') THEN
    RAISE EXCEPTION '20261027000002 FAILED: service_role cannot read and write public.users';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename = 'users'
       AND policyname IN ('Users can insert own profile', 'Users can update own profile')
  ) THEN
    RAISE EXCEPTION '20261027000002 FAILED: an own-row write policy is still on public.users';
  END IF;
END $$;

-- 2. As the learner (authenticated + matching JWT sub), INSERT and UPDATE on public.users are
--    refused with insufficient_privilege, and the own-row SELECT still works.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', :user_id, 'role', 'authenticated')::text, true);

DO $$
DECLARE
  v_uid uuid := (current_setting('request.jwt.claims')::json ->> 'sub')::uuid;
  v_stmt text;
  v_rows int;
BEGIN
  FOREACH v_stmt IN ARRAY ARRAY[
    format($q$INSERT INTO public.users (id, email) VALUES (%L, 't29-probe@example.invalid')$q$, gen_random_uuid()),
    format($q$UPDATE public.users SET name = name WHERE id = %L$q$, v_uid),
    format($q$UPDATE public.users SET is_admin = true WHERE id = %L$q$, v_uid),
    format($q$DELETE FROM public.users WHERE id = %L$q$, v_uid)
  ] LOOP
    BEGIN
      EXECUTE v_stmt;
      RAISE EXCEPTION '20261027000002 FAILED: learner could run %', v_stmt;
    EXCEPTION WHEN insufficient_privilege THEN
      NULL; -- expected (permission denied for table users)
    END;
  END LOOP;

  SELECT count(*) INTO v_rows FROM public.users WHERE id = v_uid;
  IF v_rows <> 1 THEN
    RAISE EXCEPTION '20261027000002 FAILED: learner cannot read their own row (got % rows)', v_rows;
  END IF;
END $$;

RESET ROLE;

-- 3. As anon, INSERT is refused.
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);

DO $$
BEGIN
  BEGIN
    INSERT INTO public.users (id, email) VALUES (gen_random_uuid(), 't29-anon@example.invalid');
    RAISE EXCEPTION '20261027000002 FAILED: anon could insert into public.users';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL; -- expected
  END;
END $$;

RESET ROLE;

-- 4. The guard is an allow-list: a role it does not name is checked even when it has write access
--    and a permissive policy. t29_guard_probe stands in for any future PostgREST-switchable role.
CREATE ROLE t29_guard_probe NOLOGIN;
GRANT t29_guard_probe TO current_user;
GRANT USAGE ON SCHEMA public TO t29_guard_probe;
GRANT SELECT, UPDATE ON public.users TO t29_guard_probe;
CREATE POLICY t29_guard_probe_all ON public.users FOR ALL TO t29_guard_probe USING (true) WITH CHECK (true);

-- psql does not substitute :user_id inside a dollar-quoted DO body, so pass it through a setting.
SELECT set_config('t29.user_id', :user_id, true);

SET LOCAL ROLE t29_guard_probe;

DO $$
DECLARE
  v_uid uuid := current_setting('t29.user_id')::uuid;
  v_col text;
BEGIN
  FOREACH v_col IN ARRAY ARRAY['is_admin', 'is_fellow', 'curriculum_access_override'] LOOP
    BEGIN
      EXECUTE format('UPDATE public.users SET %I = NOT coalesce(%I, false) WHERE id = %L', v_col, v_col, v_uid);
      RAISE EXCEPTION '20261027000002 FAILED: an unlisted role could change users.%', v_col;
    EXCEPTION WHEN insufficient_privilege THEN
      NULL; -- expected (the guard raises 42501)
    END;
  END LOOP;
END $$;

RESET ROLE;

-- 5. The service role is on the allow-list and can still change a guarded column (as the admin
--    console does). Rolled back below.
SET LOCAL ROLE service_role;
UPDATE public.users SET is_fellow = NOT coalesce(is_fellow, false) WHERE id = :user_id::uuid;
UPDATE public.users SET name = name WHERE id = :user_id::uuid;
RESET ROLE;

DO $$ BEGIN RAISE NOTICE '20261027000002 validation passed'; END $$;

ROLLBACK;
