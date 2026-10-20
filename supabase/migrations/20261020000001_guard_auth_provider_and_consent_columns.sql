-- Google sign-in: stop learners editing auth_provider and the signup consent record.
--
-- The users UPDATE policy "Users can update own profile" (20260728000002_create_user_state.sql)
-- has no column limit, so a signed-in learner could PATCH their own row through PostgREST and:
--   * set terms_accepted_at to skip the consent gate in proxy.ts (it holds a Google sign-up on
--     /signup/complete-consent until terms_accepted_at is set), or switch auth_provider away
--     from 'google' for the same effect;
--   * forge or rewrite the consent record (terms_accepted_at, terms_version, privacy_version,
--     age_confirmed_at, age_confirmed_minimum), which is a legal record and must only be written
--     server-side from lib/legal/consent.ts (buildConsentRecord).
--
-- Every legitimate writer uses the service-role client: ensureUserProfile from the signup,
-- login and OAuth callback routes and app/(app)/layout.tsx, and the consent update in
-- app/api/auth/complete-consent/route.ts. Onboarding and settings never write these columns.
-- So, as for the other guarded columns, only `authenticated` and `anon` are restricted:
--   * INSERT: auth_provider must be 'email' (the column default) and every consent column NULL.
--   * UPDATE: none of the six columns may change.
--
-- This re-creates guard_privileged_user_columns() with CREATE OR REPLACE, keeping every check
-- from 20261017000001 unchanged. The trigger (20261010000001) and the function's privileges are
-- kept as they are: CREATE OR REPLACE does not touch grants, and trigger functions are not
-- EXECUTE-checked when the trigger fires, so the closed default privileges from 20261018000001
-- do not affect it. Still NOT security definer: `current_user` must be the caller's role.
--
-- Idempotent and non-destructive. No data is changed.

SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION public.guard_privileged_user_columns()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Deny-list: add every new PostgREST-switchable end-user role here.
  IF current_user NOT IN ('authenticated', 'anon') THEN
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

COMMENT ON FUNCTION public.guard_privileged_user_columns() IS
'Rejects end-user (authenticated/anon) writes to is_admin, is_fellow, curriculum_access_override, portfolio_verification_override, auth_provider and the consent columns (terms_accepted_at, terms_version, privacy_version, age_confirmed_at, age_confirmed_minimum), and (on UPDATE) email. Service role and postgres are unaffected.';
