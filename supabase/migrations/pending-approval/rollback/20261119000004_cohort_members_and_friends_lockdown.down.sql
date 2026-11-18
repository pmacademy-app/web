-- Rollback for 20261119000004: cohort_members and user_friends lockdown (M6).
--
-- Restores the state 20260805000006_create_leaderboards_and_cohorts.sql left behind:
--   * ALL on public.cohort_members for anon, and every privilege except SELECT (which the forward
--     migration kept) for authenticated;
--   * ALL on public.user_friends for anon and authenticated (Supabase's default grants, which the
--     forward migration revoked);
--   * the six policies exactly as 20260805000006:94-121 created them.
-- "Cohort members view cohort" was never dropped, so it is not re-created here.
--
-- Rolling back re-opens the holes described in the forward migration (anon reads every
-- membership, learners join private cohorts, one-sided accepted friendships), so only do this to
-- unblock an outage and re-apply after. The app does not need the rollback: it reads and writes
-- both tables only through the service role. No data is changed. Re-runnable.

SET search_path = public, pg_temp;

GRANT ALL ON public.cohort_members TO anon;
GRANT INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.cohort_members TO authenticated;
GRANT ALL ON public.user_friends TO anon, authenticated;

DROP POLICY IF EXISTS "Users can view cohort members" ON public.cohort_members;
CREATE POLICY "Users can view cohort members"
  ON public.cohort_members FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Users can join cohorts" ON public.cohort_members;
CREATE POLICY "Users can join cohorts"
  ON public.cohort_members FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can leave cohorts" ON public.cohort_members;
CREATE POLICY "Users can leave cohorts"
  ON public.cohort_members FOR DELETE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view their friends" ON public.user_friends;
CREATE POLICY "Users can view their friends"
  ON public.user_friends FOR SELECT
  USING (auth.uid() = user_id OR auth.uid() = friend_id);

DROP POLICY IF EXISTS "Users can add friends" ON public.user_friends;
CREATE POLICY "Users can add friends"
  ON public.user_friends FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can remove friends" ON public.user_friends;
CREATE POLICY "Users can remove friends"
  ON public.user_friends FOR DELETE
  USING (auth.uid() = user_id OR auth.uid() = friend_id);
