-- Phase 2 / T29 (SEC-07), part 2: learners cannot write public.users through PostgREST.
--
-- HELD IN pending-approval/. Release only after the app change below is deployed (see
-- "Release order").
--
-- The own-row policies "Users can insert own profile" and "Users can update own profile"
-- (20260728000002_create_user_state.sql:224-225) have no column limit, so a signed-in learner can
-- INSERT or PATCH their own row with the anon key. guard_privileged_user_columns() (created in
-- 20261010000001, last redefined in 20261020000001) blocks the privileged, email, provider and
-- consent columns, but only for the roles it names: it is a deny-list on ('authenticated', 'anon'),
-- so any other role PostgREST can switch to (a custom JWT `role` claim) is not guarded at all.
--
-- This migration:
--   1. REVOKEs INSERT, UPDATE and DELETE on public.users from PUBLIC, anon and authenticated, and
--      drops the two own-row write policies. SELECT and the read policies are unchanged.
--   2. Turns the guard into an allow-list: only postgres, service_role and supabase_admin may write
--      the guarded columns. Every other role, including any future one, is guarded.
--
-- Who still writes public.users, all unaffected:
--   * Server code through createServiceRoleClient() that never signs a user in (service_role).
--   * SECURITY DEFINER functions owned by postgres: update_user_xp_and_level,
--     sync_user_xp_and_level_on_update, sync_user_xp, record_lesson_quiz_completion,
--     increment_portfolio_view_count. Their privilege checks and current_user are the owner's.
--   * Operators in the SQL editor (postgres).
--
-- Release order: app/api/auth/login/route.ts and the token_hash path of
-- app/api/auth/callback/route.ts used to call signInWithPassword / verifyOtp on a
-- createServiceRoleClient() and then write public.users through that SAME client. supabase-js
-- sends the stored session's access token on every later PostgREST call, so those writes ran as
-- `authenticated`. T29 moved every public.users write in those routes onto a separate
-- service-role client that never holds a session. Deploy that change first; applying this
-- migration against the old code breaks login (first-login profile insert) and email
-- verification (profile insert, email_change sync).
--
-- Idempotent: REVOKE, DROP POLICY IF EXISTS, CREATE OR REPLACE FUNCTION, DROP TRIGGER IF EXISTS /
-- CREATE TRIGGER and the self-check can all be re-run. No data is changed. Nothing here grants
-- anything to anon or authenticated.
-- Rollback: rollback/20261027000002_lock_public_users.down.sql (next to this file).
-- Staging validation: validation/20261027000002_lock_public_users_validation.sql.

SET search_path = public, pg_temp;

-- ---------------------------------------------------------------------------
-- 1. No direct writes from PostgREST end-user roles
-- ---------------------------------------------------------------------------

REVOKE INSERT, UPDATE, DELETE ON public.users FROM PUBLIC, anon, authenticated;

DROP POLICY IF EXISTS "Users can insert own profile" ON public.users;
DROP POLICY IF EXISTS "Users can update own profile" ON public.users;

-- ---------------------------------------------------------------------------
-- 2. Guard trigger: allow-list instead of deny-list
-- ---------------------------------------------------------------------------
-- Every check is unchanged from 20261020000001; only the role test at the top is inverted.
-- Still NOT security definer: `current_user` must be the caller's role (inside a SECURITY DEFINER
-- function that writes users, it is that function's owner, which is how the XP triggers pass).

CREATE OR REPLACE FUNCTION public.guard_privileged_user_columns()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Allow-list: only these roles may write the guarded columns. Every other role is checked.
  IF current_user IN ('postgres', 'service_role', 'supabase_admin') THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF coalesce(NEW.is_admin, false)
       OR coalesce(NEW.is_fellow, false)
       OR coalesce(NEW.curriculum_access_override, false)
       OR NEW.portfolio_verification_override IS NOT NULL THEN
      RAISE EXCEPTION 'privileged user columns can only be set by the service'
        USING ERRCODE = '42501';
    END IF;

    IF NEW.auth_provider IS DISTINCT FROM 'email'
       OR NEW.terms_accepted_at IS NOT NULL
       OR NEW.terms_version IS NOT NULL
       OR NEW.privacy_version IS NOT NULL
       OR NEW.age_confirmed_at IS NOT NULL
       OR NEW.age_confirmed_minimum IS NOT NULL THEN
      RAISE EXCEPTION 'auth provider and consent columns can only be set by the service'
        USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.is_admin IS DISTINCT FROM OLD.is_admin
     OR NEW.is_fellow IS DISTINCT FROM OLD.is_fellow
     OR NEW.curriculum_access_override IS DISTINCT FROM OLD.curriculum_access_override
     OR NEW.portfolio_verification_override IS DISTINCT FROM OLD.portfolio_verification_override THEN
    RAISE EXCEPTION 'privileged user columns can only be changed by the service'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.email IS DISTINCT FROM OLD.email THEN
    RAISE EXCEPTION 'users.email can only be changed by the service'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.auth_provider IS DISTINCT FROM OLD.auth_provider
     OR NEW.terms_accepted_at IS DISTINCT FROM OLD.terms_accepted_at
     OR NEW.terms_version IS DISTINCT FROM OLD.terms_version
     OR NEW.privacy_version IS DISTINCT FROM OLD.privacy_version
     OR NEW.age_confirmed_at IS DISTINCT FROM OLD.age_confirmed_at
     OR NEW.age_confirmed_minimum IS DISTINCT FROM OLD.age_confirmed_minimum THEN
    RAISE EXCEPTION 'auth provider and consent columns can only be changed by the service'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_guard_privileged_user_columns ON public.users;
CREATE TRIGGER trigger_guard_privileged_user_columns
BEFORE INSERT OR UPDATE ON public.users
FOR EACH ROW
EXECUTE FUNCTION public.guard_privileged_user_columns();

COMMENT ON FUNCTION public.guard_privileged_user_columns() IS
'Allow-list guard: only postgres, service_role and supabase_admin may write is_admin, is_fellow, curriculum_access_override, portfolio_verification_override, auth_provider, the consent columns (terms_accepted_at, terms_version, privacy_version, age_confirmed_at, age_confirmed_minimum) and (on UPDATE) email. Every other role is rejected.';

-- ---------------------------------------------------------------------------
-- 3. Self-check
-- ---------------------------------------------------------------------------
-- REVOKE says nothing when a grant made by another role stays in place, and a column-level grant
-- made by a different grantor survives a table-level REVOKE. Check the result instead.
DO $$
DECLARE
  v_role text;
  v_src text;
BEGIN
  FOREACH v_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF has_table_privilege(v_role, 'public.users', 'INSERT, UPDATE, DELETE')
       OR has_any_column_privilege(v_role, 'public.users', 'INSERT, UPDATE') THEN
      RAISE EXCEPTION '% can still write public.users. Look up the grantor in information_schema.role_table_grants and column_privileges, run REVOKE as that role, then apply this migration again.', v_role;
    END IF;
  END LOOP;

  -- proxy.ts and getCurrentUserProfile() read the learner's own row with the learner's token.
  IF NOT has_table_privilege('authenticated', 'public.users', 'SELECT') THEN
    RAISE EXCEPTION 'authenticated lost SELECT on public.users. This migration must not change reads.';
  END IF;

  IF NOT has_table_privilege('service_role', 'public.users', 'INSERT, UPDATE') THEN
    RAISE EXCEPTION 'service_role cannot write public.users. The app writes it through the service role.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename = 'users'
       AND policyname IN ('Users can insert own profile', 'Users can update own profile')
  ) THEN
    RAISE EXCEPTION 'An own-row write policy is still present on public.users.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgrelid = 'public.users'::regclass
       AND tgname = 'trigger_guard_privileged_user_columns'
       AND NOT tgisinternal
       AND tgenabled <> 'D'
  ) THEN
    RAISE EXCEPTION 'trigger_guard_privileged_user_columns is missing or disabled on public.users.';
  END IF;

  SELECT prosrc INTO v_src
    FROM pg_proc
   WHERE oid = 'public.guard_privileged_user_columns()'::regprocedure;
  IF v_src NOT LIKE '%current_user IN (''postgres'', ''service_role'', ''supabase_admin'')%'
     OR v_src LIKE '%NOT IN (''authenticated'', ''anon'')%' THEN
    RAISE EXCEPTION 'guard_privileged_user_columns() is not the allow-list version.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_proc
     WHERE oid = 'public.guard_privileged_user_columns()'::regprocedure
       AND prosecdef
  ) THEN
    RAISE EXCEPTION 'guard_privileged_user_columns() must not be SECURITY DEFINER (current_user must be the caller).';
  END IF;
END $$;
