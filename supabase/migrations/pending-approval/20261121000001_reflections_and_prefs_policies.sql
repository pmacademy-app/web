-- Plan A step 3 (docs/ops/backend-phase3-plan.md): tighten two learner policies.
--
-- 1. reflections. "Users manage own reflections" was FOR ALL, so a learner token could
--    insert, update or delete its own reflection rows straight through PostgREST,
--    including is_public, lesson_id and created_at. Every reflection write in the app
--    runs server-side with the service role (lib/academy/lessons-db.ts,
--    lib/capstones/capstones-db.ts, lib/settings/settings-service.ts), so learners keep
--    SELECT on their own rows and lose direct writes. The public-read policy is left
--    as it is (20261119000005 handles anonymous access separately).
--
-- 2. user_notification_preferences. The update policy had USING but no WITH CHECK, so an
--    update could in principle move a row to another user_id. Adds the check.
--
-- No app change is needed: nothing writes reflections with a learner token, and the
-- notification settings route always writes the session user's own row.
-- Additive in effect, re-runnable, validates itself.

SET search_path = public, pg_temp;

DROP POLICY IF EXISTS "Users manage own reflections" ON public.reflections;
DROP POLICY IF EXISTS "Users can view own reflections" ON public.reflections;
CREATE POLICY "Users can view own reflections"
  ON public.reflections FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

REVOKE INSERT, UPDATE, DELETE ON public.reflections FROM PUBLIC, anon, authenticated;

ALTER POLICY "Users can update own preferences"
  ON public.user_notification_preferences
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DO $$
BEGIN
  IF has_table_privilege('authenticated', 'public.reflections', 'INSERT, UPDATE, DELETE')
     OR has_table_privilege('anon', 'public.reflections', 'INSERT, UPDATE, DELETE') THEN
    RAISE EXCEPTION 'A learner role can still write public.reflections. Look up the grantor in information_schema.role_table_grants, REVOKE as that role, then apply again.';
  END IF;

  IF NOT has_table_privilege('authenticated', 'public.reflections', 'SELECT') THEN
    RAISE EXCEPTION 'authenticated lost SELECT on public.reflections. This migration must not change reads.';
  END IF;

  IF NOT has_table_privilege('service_role', 'public.reflections', 'INSERT, UPDATE, DELETE') THEN
    RAISE EXCEPTION 'service_role cannot write public.reflections. The app writes reflections through the service role.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'reflections'
       AND policyname = 'Users manage own reflections'
  ) THEN
    RAISE EXCEPTION 'The FOR ALL reflections policy is still present.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'user_notification_preferences'
       AND policyname = 'Users can update own preferences'
       AND with_check IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'The preferences update policy has no WITH CHECK.';
  END IF;
END $$;
