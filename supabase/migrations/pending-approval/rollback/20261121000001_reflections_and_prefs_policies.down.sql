-- Rollback for 20261121000001: restore the FOR ALL reflections policy and learner write
-- grants, and drop the WITH CHECK on the preferences update policy. Re-runnable.

SET search_path = public, pg_temp;

DROP POLICY IF EXISTS "Users can view own reflections" ON public.reflections;
DROP POLICY IF EXISTS "Users manage own reflections" ON public.reflections;
CREATE POLICY "Users manage own reflections"
  ON public.reflections FOR ALL
  USING (auth.uid() = user_id);

GRANT INSERT, UPDATE, DELETE ON public.reflections TO authenticated;

DROP POLICY IF EXISTS "Users can update own preferences" ON public.user_notification_preferences;
CREATE POLICY "Users can update own preferences"
  ON public.user_notification_preferences FOR UPDATE
  USING (auth.uid() = user_id);
