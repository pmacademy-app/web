-- Rollback for 20261013000002 — in-app notification update restriction.
--
-- Restores the state left by 20260806000001: table-wide UPDATE for the end-user roles (the
-- Supabase default grant for a public table) and the original policy with no WITH CHECK. No data
-- is touched. Rolling back re-opens the hole described in the forward migration, so only do this
-- to unblock an outage and re-apply after.

REVOKE UPDATE (is_read, read_at) ON public.in_app_notifications FROM authenticated;
GRANT UPDATE ON public.in_app_notifications TO authenticated, anon;

DROP POLICY IF EXISTS "Users can update own in-app notifications" ON public.in_app_notifications;
CREATE POLICY "Users can update own in-app notifications"
  ON public.in_app_notifications FOR UPDATE
  USING (auth.uid() = user_id);
