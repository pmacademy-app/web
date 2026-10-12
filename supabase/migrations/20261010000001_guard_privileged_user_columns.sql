-- Growth R4 / A0 — guard privileged columns on public.users.
--
-- The users RLS policies (20260728000002_create_user_state.sql) let a learner INSERT and UPDATE
-- their own row with no column restriction. Through the anon key, a signed-in learner could set
-- is_admin, is_fellow, curriculum_access_override or portfolio_verification_override on
-- themselves. total_xp and level are already re-derived by trigger_sync_user_xp_on_update
-- (20260925000002); these four columns had no equivalent.
--
-- Every legitimate writer of these columns is server-side and uses the service-role client
-- (lib/admin/service.ts: toggleUserAdminRole, toggleUserFellowStatus,
-- setPortfolioVerificationOverride), or is an operator in the SQL console (postgres). So the
-- guard only restricts the PostgREST end-user roles, `authenticated` and `anon`.
--
-- The function is deliberately NOT security definer: `current_user` must be the caller's role.
--
-- The role check below is a deny-list, not an allow-list: only the roles it names are guarded.
-- Any new role that PostgREST can switch to (a custom JWT `role` claim) must be added to it,
-- or that role can write these columns.

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

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_guard_privileged_user_columns ON public.users;
CREATE TRIGGER trigger_guard_privileged_user_columns
BEFORE INSERT OR UPDATE ON public.users
FOR EACH ROW
EXECUTE FUNCTION public.guard_privileged_user_columns();

COMMENT ON FUNCTION public.guard_privileged_user_columns() IS
'Rejects end-user (authenticated/anon) writes to is_admin, is_fellow, curriculum_access_override and portfolio_verification_override. Service role and postgres are unaffected.';
