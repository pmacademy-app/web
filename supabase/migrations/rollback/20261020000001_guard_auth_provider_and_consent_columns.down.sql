-- Rollback for 20261020000001: auth_provider and consent column guard.
--
-- Restores guard_privileged_user_columns() exactly as 20261017000001 left it. The trigger and the
-- function's privileges are untouched. Rolling back re-opens the hole described in the forward
-- migration (a learner can skip the Google consent gate and forge consent), so only do this to
-- unblock an outage and re-apply after. No data is changed.

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

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.guard_privileged_user_columns() IS
'Rejects end-user (authenticated/anon) writes to is_admin, is_fellow, curriculum_access_override, portfolio_verification_override and (on UPDATE) email. Service role and postgres are unaffected.';
