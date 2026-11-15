-- Validation for 20261113000002: before_user_created signup gate hook (AG-12 / SEC-09).
--
-- Read-only / rollback-safe verification script. Run in Supabase SQL editor as postgres.
--
-- Verifies:
-- 1. Function existence, language, security definer, and search_path.
-- 2. Privilege isolation (supabase_auth_admin has execute; PUBLIC, anon, authenticated do not).
-- 3. Functional behavior when allowSignups is true vs false.

BEGIN;

-- 1. Function existence and attributes
DO $$
DECLARE
  v_prosecdef boolean;
  v_proconfig text[];
BEGIN
  SELECT p.prosecdef, p.proconfig
  INTO v_prosecdef, v_proconfig
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'hook_before_user_created';

  IF NOT FOUND THEN
    RAISE EXCEPTION '20261113000002 validation failed: public.hook_before_user_created(jsonb) not found';
  END IF;

  IF NOT v_prosecdef THEN
    RAISE EXCEPTION '20261113000002 validation failed: function must be SECURITY DEFINER';
  END IF;

  IF v_proconfig IS NULL OR NOT ('search_path=public, pg_temp' = ANY(v_proconfig)) THEN
    RAISE EXCEPTION '20261113000002 validation failed: function search_path must be fixed to public, pg_temp';
  END IF;
END;
$$;

-- 2. Privilege checks
DO $$
BEGIN
  IF has_function_privilege('anon', 'public.hook_before_user_created(jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION '20261113000002 validation failed: anon must not have EXECUTE privilege';
  END IF;

  IF has_function_privilege('authenticated', 'public.hook_before_user_created(jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION '20261113000002 validation failed: authenticated must not have EXECUTE privilege';
  END IF;

  IF NOT has_function_privilege('supabase_auth_admin', 'public.hook_before_user_created(jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION '20261113000002 validation failed: supabase_auth_admin must have EXECUTE privilege';
  END IF;
END;
$$;

-- 3. Behavioral checks
DO $$
DECLARE
  v_event jsonb := '{"user": {"email": "learner@example.com"}}'::jsonb;
  v_res jsonb;
BEGIN
  -- Test with signups allowed:
  INSERT INTO public.system_settings (key, value, updated_at)
  VALUES ('product_settings', '{"allowSignups": true}'::jsonb, now())
  ON CONFLICT (key) DO UPDATE
  SET value = '{"allowSignups": true}'::jsonb;

  v_res := public.hook_before_user_created(v_event);
  IF v_res->'error' IS NOT NULL THEN
    RAISE EXCEPTION '20261113000002 validation failed: expected allowSignups=true to allow event';
  END IF;

  -- Test with signups disabled:
  UPDATE public.system_settings
  SET value = '{"allowSignups": false}'::jsonb
  WHERE key = 'product_settings';

  v_res := public.hook_before_user_created(v_event);
  IF v_res->'error' IS NULL OR (v_res->'error'->>'http_code')::int <> 403 THEN
    RAISE EXCEPTION '20261113000002 validation failed: expected allowSignups=false to return 403 error object';
  END IF;
END;
$$;

ROLLBACK;

-- Notice to operator
SELECT '20261113000002 validation passed' AS result;
