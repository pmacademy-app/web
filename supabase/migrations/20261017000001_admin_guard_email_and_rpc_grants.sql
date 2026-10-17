-- Security hardening: stop learners editing users.email, and lock down the governance RPCs.
--
-- 1. users.email is an app profile column. The users UPDATE policy
--    (20260728000002_create_user_state.sql) has no column limit, so a signed-in learner could
--    rewrite their own users.email through PostgREST. The admin API guard used to trust that
--    column for the ADMIN_EMAILS check (now fixed in lib/admin/guard.ts to use the verified
--    auth email). This closes the same hole at the database layer.
--
--    The only legitimate writer of users.email is the email-change confirmation in
--    app/api/auth/callback/route.ts, which uses the service-role client, so the guard
--    (which only restricts `authenticated` and `anon`) does not affect it.
--
-- 2. 20260909000001 revoked the governance functions FROM PUBLIC only. Supabase grants
--    EXECUTE to anon and authenticated explicitly, so those grants survived and the public
--    anon key could call SECURITY DEFINER functions such as mark_provider_exhausted and
--    consume_rate_limit. Every caller uses the service-role client (lib/rate-limit.ts,
--    lib/email-governance.ts, lib/notifications/providers/provider-quota.ts).
--
-- Both parts are idempotent and non-destructive. No data is changed.

-- ---------------------------------------------------------------------------
-- 1. Guard users.email against end-user writes
-- ---------------------------------------------------------------------------

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

-- ---------------------------------------------------------------------------
-- 2. Governance RPCs: service role only
-- ---------------------------------------------------------------------------

REVOKE ALL ON FUNCTION public.claim_email_send(text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.finalize_email_send(text, text, text, int, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.consume_rate_limit(text, int, bigint) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reserve_provider_email_quota(text, int) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.release_provider_email_quota(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mark_provider_exhausted(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.is_provider_exhausted(text) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.claim_email_send(text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.finalize_email_send(text, text, text, int, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.consume_rate_limit(text, int, bigint) TO service_role;
GRANT EXECUTE ON FUNCTION public.reserve_provider_email_quota(text, int) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_provider_email_quota(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.mark_provider_exhausted(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.is_provider_exhausted(text) TO service_role;
