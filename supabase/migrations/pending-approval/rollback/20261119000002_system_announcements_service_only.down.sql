-- Rollback for 20261119000002: public.system_announcements service-role only (M3).
--
-- Restores the state 20260822000001_system_announcements_and_perf.sql left behind:
--   * ALL on public.system_announcements for anon and authenticated (Supabase's default grants,
--     which the forward migration revoked);
--   * "Active announcements viewable by all" and "Admins manage announcements", exactly as
--     20260822000001:80-98 created them.
--
-- Rolling back re-opens the hole described in the forward migration (anyone with the anon key can
-- read individual and cohort announcements), so only do this to unblock an outage and re-apply
-- after. The app does not need the rollback: it reads and writes announcements only through the
-- service role. No data is changed. Re-runnable.

SET search_path = public, pg_temp;

GRANT ALL ON public.system_announcements TO anon, authenticated;

DROP POLICY IF EXISTS "Active announcements viewable by all" ON public.system_announcements;
CREATE POLICY "Active announcements viewable by all"
  ON public.system_announcements
  FOR SELECT
  USING (
    status = 'active'
    AND (scheduled_at IS NULL OR scheduled_at <= now())
    AND (expires_at IS NULL OR expires_at > now())
  );

DROP POLICY IF EXISTS "Admins manage announcements" ON public.system_announcements;
CREATE POLICY "Admins manage announcements"
  ON public.system_announcements
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.is_admin = true
    )
  );
