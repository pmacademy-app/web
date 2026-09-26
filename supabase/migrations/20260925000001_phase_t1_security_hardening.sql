-- PM Academy — Phase T1 Security Hardening Migration
-- Migration: 20260925000001_phase_t1_security_hardening.sql
-- Description:
--   1. Revoke direct client INSERT on public.certificates to prevent credential forgery (CRIT-01 / SEC-01).
--      Certificates must only be inserted by the authorized backend service role after prerequisite validation.
--   2. Introduce get_auth_user_id_by_email() security definer function for safe, O(1) unconfirmed login
--      resolution without loading large user populations into Node.js memory (CRIT-04).

SET search_path TO public, extensions, auth;

-- ─── 1. Certificate RLS Hardening (CRIT-01 / SEC-01) ─────────────────────────
-- Revoke direct learner insert on certificates table.
-- Any client-side insertion attempt via PostgREST/anon/authenticated client will be rejected by RLS.
DROP POLICY IF EXISTS "Users can insert own certificates" ON public.certificates;

-- Ensure RLS is enabled on certificates
ALTER TABLE public.certificates ENABLE ROW LEVEL SECURITY;

-- Learners may still view their own certificates (policy preserved from b1 hardening)
-- Verification page resolves via service-role getDedupedVerifiedCertificate() or public endpoint

-- ─── 2. Auth User Resolution Helper for Scalable Login (CRIT-04) ─────────────
-- Provides O(1) indexed lookup of auth.users ID by normalized email.
-- Accessible strictly by service_role and postgres; revoked from anon/authenticated learners.
CREATE OR REPLACE FUNCTION public.get_auth_user_id_by_email(p_email TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = auth, pg_temp
AS $$
DECLARE
  v_user_id UUID;
BEGIN
  IF p_email IS NULL OR trim(p_email) = '' THEN
    RETURN NULL;
  END IF;

  SELECT id INTO v_user_id
  FROM auth.users
  WHERE lower(email) = lower(trim(p_email))
  LIMIT 1;

  RETURN v_user_id;
END;
$$;

-- Security: Restrict execution strictly to backend service_role / postgres
REVOKE EXECUTE ON FUNCTION public.get_auth_user_id_by_email(TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_auth_user_id_by_email(TEXT) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_auth_user_id_by_email(TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_auth_user_id_by_email(TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_auth_user_id_by_email(TEXT) TO postgres;

COMMENT ON FUNCTION public.get_auth_user_id_by_email(TEXT) IS 
  'Securely resolves a user UUID from auth.users by email for administrative login recovery. Executable only by service_role.';
