-- Rollback for 20261119000005: drop anon portfolio policies (L1).
--
-- Restores the state left by 20260728000002_create_user_state.sql and
-- 20261024000002_lock_users_and_capstone_client_writes.sql:
--   * SELECT on public.capstone_submissions for anon (its writes stay revoked, as 20261024000002
--     left them);
--   * ALL on public.reflections for anon (Supabase's default grant);
--   * "Public can view public capstones" and "Public can view public reflections", exactly as
--     20260728000002:241,248 created them.
--
-- Rolling back re-exposes every is_public capstone and reflection, with all columns, to the anon
-- key. If 20261113000004 is applied, that includes reviewer feedback. Only do this to unblock an
-- outage and re-apply after. The app does not need the rollback: it reads both tables only through
-- the service role. No data is changed. Re-runnable.

SET search_path = public, pg_temp;

GRANT SELECT ON public.capstone_submissions TO anon;
GRANT ALL ON public.reflections TO anon;

DROP POLICY IF EXISTS "Public can view public capstones" ON public.capstone_submissions;
CREATE POLICY "Public can view public capstones" ON public.capstone_submissions FOR SELECT USING (is_public = true);

DROP POLICY IF EXISTS "Public can view public reflections" ON public.reflections;
CREATE POLICY "Public can view public reflections" ON public.reflections FOR SELECT USING (is_public = true);
