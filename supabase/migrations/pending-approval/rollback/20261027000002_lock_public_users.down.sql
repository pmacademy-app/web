-- Rollback for 20261027000002: public.users client write lockdown (T29 / SEC-07).
--
-- Restores the state 20261020000001 left behind:
--   * INSERT, UPDATE and DELETE on public.users for anon and authenticated (Supabase's default
--     grants, which the forward migration revoked);
--   * the own-row policies "Users can insert own profile" and "Users can update own profile",
--     exactly as 20260728000002_create_user_state.sql:224-225 created them;
--   * guard_privileged_user_columns() as the deny-list on ('authenticated', 'anon'), byte for byte
--     the 20261020000001 body, and its comment.
--
-- Rolling back re-opens the hole described in the forward migration (a learner can insert or edit
-- their own row directly, and any role other than anon/authenticated skips the column guard), so
-- only do this to unblock an outage and re-apply after. The app does not need the rollback: since
-- T29 it writes public.users only through a service-role client with no session. No data is
-- changed. Re-runnable.

SET search_path = public, pg_temp;

GRANT INSERT, UPDATE, DELETE ON public.users TO anon, authenticated;

DROP POLICY IF EXISTS "Users can insert own profile" ON public.users;
DROP POLICY IF EXISTS "Users can update own profile" ON public.users;

CREATE POLICY "Users can insert own profile" ON public.users FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON public.users FOR UPDATE USING (auth.uid() = id);

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

DROP TRIGGER IF EXISTS trigger_guard_privileged_user_columns ON public.users;
CREATE TRIGGER trigger_guard_privileged_user_columns
BEFORE INSERT OR UPDATE ON public.users
FOR EACH ROW
EXECUTE FUNCTION public.guard_privileged_user_columns();

COMMENT ON FUNCTION public.guard_privileged_user_columns() IS
'Rejects end-user (authenticated/anon) writes to is_admin, is_fellow, curriculum_access_override, portfolio_verification_override, auth_provider and the consent columns (terms_accepted_at, terms_version, privacy_version, age_confirmed_at, age_confirmed_minimum), and (on UPDATE) email. Service role and postgres are unaffected.';
