-- Rollback for 20261024000002: capstone_submissions client write lockdown.
--
-- Restores the FOR ALL own-row policy "Users manage own capstones" exactly as
-- 20260728000002_create_user_state.sql:247 created it, drops the SELECT-only replacement, and
-- gives INSERT, UPDATE and DELETE back to anon and authenticated (Supabase's default grants,
-- which the forward migration revoked). Rolling back re-opens the hole described in the forward
-- migration (a learner can insert, edit or delete their own submission directly), so only do
-- this to unblock an outage and re-apply after. No data is changed. Re-runnable.
--
-- PUBLIC is deliberately not re-granted. The forward migration revokes from PUBLIC only to clear
-- any stray grant; Supabase's defaults never give PUBLIC write access to this table, so restoring
-- the anon and authenticated grants is the full inverse of the default state.

SET search_path = public, pg_temp;

DROP POLICY IF EXISTS "Users view own capstones" ON public.capstone_submissions;
DROP POLICY IF EXISTS "Users manage own capstones" ON public.capstone_submissions;

CREATE POLICY "Users manage own capstones"
  ON public.capstone_submissions FOR ALL
  USING (auth.uid() = user_id);

GRANT INSERT, UPDATE, DELETE ON public.capstone_submissions TO anon, authenticated;
