-- Rollback for 20261113000002: before_user_created signup gate hook.
--
-- Drops the hook function. Run it in the Supabase SQL editor. Safe to re-run.
-- If the hook was configured in the Supabase dashboard (Auth > Hooks), remove
-- the hook assignment before or immediately after running this script.

SET search_path = public, pg_temp;

DROP FUNCTION IF EXISTS public.hook_before_user_created(jsonb);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'hook_before_user_created'
  ) THEN
    RAISE EXCEPTION '20261113000002 rollback failed: hook_before_user_created still exists.';
  END IF;
END;
$$;
