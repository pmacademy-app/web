-- Learners may only change the read state of their own in-app notifications.
--
-- The update policy from 20260806000001_notification_platform_foundation.sql lets a learner
-- UPDATE their own row with no column restriction. Through the anon key, a signed-in learner
-- could clear celebrated_at (replaying a celebration) or rewrite action_url, secondary_action,
-- title, body or idempotency_key on their own rows.
--
-- Every writer in the app is server-side and uses the service-role client
-- (app/api/notifications/route.ts, lib/notifications/in-app/service.ts,
-- lib/notifications/in-app/achievement-celebrations.ts, lib/admin/in-app-manager-service.ts),
-- which bypasses both table privileges and RLS. So the end-user roles keep only what "mark
-- read" needs: is_read and read_at. Reads (the SELECT policy and grant) are not touched.
--
-- Re-runnable: REVOKE and GRANT are idempotent and the policy is dropped before it is created.

REVOKE UPDATE ON public.in_app_notifications FROM authenticated, anon;
GRANT UPDATE (is_read, read_at) ON public.in_app_notifications TO authenticated;

DROP POLICY IF EXISTS "Users can update own in-app notifications" ON public.in_app_notifications;
CREATE POLICY "Users can update own in-app notifications"
  ON public.in_app_notifications FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

COMMENT ON POLICY "Users can update own in-app notifications" ON public.in_app_notifications IS
'A learner may update their own rows; column privileges limit that to is_read and read_at. All other writes go through the service role.';

-- Self-check. REVOKE only removes privileges that the role running it granted, and it reports
-- nothing when the same privilege, granted by another role, is left in place. So verify the
-- result instead of trusting the statements above: no table-wide UPDATE for learners, and the
-- two read-state columns still writable. Read-only, so the migration stays re-runnable.
DO $$
BEGIN
  IF has_table_privilege('authenticated', 'public.in_app_notifications', 'UPDATE') THEN
    RAISE EXCEPTION 'authenticated still has table-wide UPDATE on public.in_app_notifications. REVOKE only removes privileges given by the role that runs it: look up the grantor in information_schema.role_table_grants (also check PUBLIC and any role authenticated is a member of), run REVOKE UPDATE ON public.in_app_notifications as that role, then apply this migration again.';
  END IF;
  IF NOT has_column_privilege('authenticated', 'public.in_app_notifications', 'is_read', 'UPDATE') THEN
    RAISE EXCEPTION 'authenticated cannot UPDATE public.in_app_notifications.is_read: learners could not mark a notification read.';
  END IF;
  IF NOT has_column_privilege('authenticated', 'public.in_app_notifications', 'read_at', 'UPDATE') THEN
    RAISE EXCEPTION 'authenticated cannot UPDATE public.in_app_notifications.read_at: learners could not mark a notification read.';
  END IF;
END $$;
