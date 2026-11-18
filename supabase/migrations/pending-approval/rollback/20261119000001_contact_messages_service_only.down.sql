-- Rollback for 20261119000001: public.contact_messages service-role only (M2).
--
-- Restores the state 20260810000002_create_contact_messages_table.sql left behind:
--   * the "Anyone can insert contact message" policy, exactly as 20260810000002:22-25 created it;
--   * INSERT, UPDATE and DELETE for anon and authenticated, and SELECT for anon (Supabase's
--     default grants, which the forward migration revoked).
--
-- Rolling back re-opens the hole described in the forward migration (anyone with the anon key can
-- insert into the admin inbox), so only do this to unblock an outage and re-apply after. The app
-- does not need the rollback: every contact_messages writer uses the service role. No data is
-- changed. Re-runnable.

SET search_path = public, pg_temp;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.contact_messages TO anon;
GRANT INSERT, UPDATE, DELETE ON public.contact_messages TO authenticated;

DROP POLICY IF EXISTS "Anyone can insert contact message" ON public.contact_messages;
CREATE POLICY "Anyone can insert contact message"
  ON public.contact_messages FOR INSERT
  TO public
  WITH CHECK (email IS NOT NULL AND length(trim(email)) > 3 AND length(trim(message)) > 0);
