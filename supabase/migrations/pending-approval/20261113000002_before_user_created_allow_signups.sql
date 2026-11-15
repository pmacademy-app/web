-- AG-12 / SEC-09: Database signup gate hook before user creation.
--
-- HELD IN pending-approval/. The Supabase CLI does not read this folder, so nothing
-- here runs on merge. The owner applies it by hand in the Supabase SQL editor.
--
-- Why: previously, the allowSignups toggle was only enforced in the Next.js API route
-- (apps/web/app/api/auth/signup/route.ts). A direct GoTrue call could bypass the route.
-- This Postgres hook runs on the auth.users before-user-created event and blocks signups
-- at the database level when product_settings.allowSignups is false.
--
-- Hook signature and returns follow Supabase Auth Hook specifications:
-- - Receives event jsonb and returns jsonb.
-- - When allowed, returns event.
-- - When blocked, returns {"error": {"http_code": 403, "message": "..."}}.
--
-- Privileges:
-- - REVOKE ALL from PUBLIC, anon, and authenticated.
-- - GRANT EXECUTE only to supabase_auth_admin.
-- - SECURITY DEFINER with fixed search_path = public, pg_temp.
--
-- Rollback: rollback/20261113000002_before_user_created_allow_signups.down.sql.
-- Validation: validation/20261113000002_before_user_created_allow_signups_validation.sql.

SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION public.hook_before_user_created(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_allow_signups boolean := true;
  v_settings jsonb;
BEGIN
  -- Read product_settings from public.system_settings
  SELECT value INTO v_settings
  FROM public.system_settings
  WHERE key = 'product_settings';

  IF v_settings IS NOT NULL AND (v_settings ? 'allowSignups') THEN
    v_allow_signups := (v_settings->>'allowSignups')::boolean;
  END IF;

  IF NOT v_allow_signups THEN
    RETURN jsonb_build_object(
      'error', jsonb_build_object(
        'http_code', 403,
        'message', 'New learner registrations are currently closed. Please check back later.'
      )
    );
  END IF;

  RETURN event;
END;
$$;

COMMENT ON FUNCTION public.hook_before_user_created(jsonb) IS
  'AG-12 / SEC-09: Auth hook invoked before new user creation to enforce system_settings allowSignups.';

-- Lock down function privileges: only supabase_auth_admin may execute this hook
REVOKE ALL ON FUNCTION public.hook_before_user_created(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hook_before_user_created(jsonb) FROM anon;
REVOKE ALL ON FUNCTION public.hook_before_user_created(jsonb) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.hook_before_user_created(jsonb) TO supabase_auth_admin;

-- Self-check to ensure function exists and evaluates safely
DO $$
DECLARE
  v_test_event jsonb := '{"user": {"email": "probe@example.com"}}'::jsonb;
  v_result jsonb;
BEGIN
  v_result := public.hook_before_user_created(v_test_event);
  IF v_result IS NULL THEN
    RAISE EXCEPTION '20261113000002 self-check failed: hook returned NULL';
  END IF;
END;
$$;
