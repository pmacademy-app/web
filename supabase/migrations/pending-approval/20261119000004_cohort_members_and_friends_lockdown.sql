-- M6: cohort membership and study friends are written only through the service role.
--
-- HELD IN pending-approval/. The Supabase CLI does not read this folder, so nothing here runs on
-- merge. The owner applies it by hand in the Supabase SQL editor.
--
-- Why (20260805000006_create_leaderboards_and_cohorts.sql:94-121):
--   * public.cohort_members "Users can view cohort members" is SELECT USING (true) with no TO
--     clause: anyone with the anon key can read every membership row (who is in which cohort,
--     private cohorts included). "Users can join cohorts" lets a learner insert themselves into
--     any cohort, including is_private ones, with no check on the cohort at all.
--   * public.user_friends "Users can add friends" checks only auth.uid() = user_id, so a learner
--     can insert a row with any friend_id and status 'accepted', creating a "friendship" the other
--     learner never agreed to (and that then shows up on that learner's friend board, because
--     "Users can view their friends" and the app match either direction).
--
-- App usage (git grep cohort_members, user_friends): every read and write goes through
-- createServiceRoleClient(): app/api/cohorts/route.ts, app/api/friends/route.ts,
-- app/api/leaderboard/route.ts, app/(app)/leaderboard/page.tsx -> lib/leaderboard-db.ts ->
-- lib/db/leaderboard.ts, and the admin recipient queries in app/api/admin/notifications/* and
-- lib/admin/in-app-manager-service.ts. No route hands these tables a learner or anon token.
--
-- This migration:
--   1. cohort_members: drops "Users can view cohort members", "Users can join cohorts" and
--      "Users can leave cohorts"; keeps "Cohort members view cohort" (SELECT own rows,
--      20260728000002:254). REVOKEs ALL from PUBLIC and anon, and everything except SELECT from
--      authenticated. A learner token can read only its own membership rows.
--   2. user_friends: drops all three policies and REVOKEs ALL from PUBLIC, anon and authenticated.
--      Not used by any client, so no client access at all.
--
-- Not changed here: public.cohorts keeps "Anyone can view public cohorts" (USING (true), so it
-- also lists private cohorts by name). Cohort names and descriptions are not personal data; tighten
-- it in a later migration if private cohorts start to carry sensitive names.
--
-- Idempotent: DROP POLICY IF EXISTS, REVOKE and the self-check can all be re-run. No data is
-- changed. Nothing here grants anything to anon or authenticated.
-- Rollback: rollback/20261119000004_cohort_members_and_friends_lockdown.down.sql (next to this file).
-- Validation: validation/20261119000004_cohort_members_and_friends_lockdown_validation.sql.

SET search_path = public, pg_temp;

-- ---------------------------------------------------------------------------
-- 1. cohort_members: own-row SELECT for learners, nothing else
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "Users can view cohort members" ON public.cohort_members;
DROP POLICY IF EXISTS "Users can join cohorts" ON public.cohort_members;
DROP POLICY IF EXISTS "Users can leave cohorts" ON public.cohort_members;

REVOKE ALL ON public.cohort_members FROM PUBLIC, anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.cohort_members FROM authenticated;

-- ---------------------------------------------------------------------------
-- 2. user_friends: no client access
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "Users can view their friends" ON public.user_friends;
DROP POLICY IF EXISTS "Users can add friends" ON public.user_friends;
DROP POLICY IF EXISTS "Users can remove friends" ON public.user_friends;

REVOKE ALL ON public.user_friends FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Self-check
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_role text;
BEGIN
  FOREACH v_role IN ARRAY ARRAY['public', 'anon', 'authenticated'] LOOP
    IF has_table_privilege(v_role, 'public.cohort_members', 'INSERT, UPDATE, DELETE, TRUNCATE')
       OR has_any_column_privilege(v_role, 'public.cohort_members', 'INSERT, UPDATE') THEN
      RAISE EXCEPTION '% can still write public.cohort_members. Look up the grantor in information_schema.role_table_grants and column_privileges, run REVOKE as that role, then apply this migration again.', v_role;
    END IF;

    IF has_table_privilege(v_role, 'public.user_friends', 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER')
       OR has_any_column_privilege(v_role, 'public.user_friends', 'SELECT, INSERT, UPDATE, REFERENCES') THEN
      RAISE EXCEPTION '% still holds a privilege on public.user_friends.', v_role;
    END IF;
  END LOOP;

  FOREACH v_role IN ARRAY ARRAY['public', 'anon'] LOOP
    IF has_table_privilege(v_role, 'public.cohort_members', 'SELECT')
       OR has_any_column_privilege(v_role, 'public.cohort_members', 'SELECT') THEN
      RAISE EXCEPTION '% can still SELECT public.cohort_members.', v_role;
    END IF;
  END LOOP;

  FOREACH v_role IN ARRAY ARRAY['public.cohort_members', 'public.user_friends'] LOOP
    IF NOT has_table_privilege('service_role', v_role, 'SELECT, INSERT, DELETE') THEN
      RAISE EXCEPTION 'service_role cannot read and write %. lib/leaderboard-db.ts needs it.', v_role;
    END IF;
  END LOOP;

  IF EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public'
       AND (
         (tablename = 'cohort_members' AND policyname <> 'Cohort members view cohort')
         OR tablename = 'user_friends'
       )
  ) THEN
    RAISE EXCEPTION 'An unexpected policy is still present on public.cohort_members or public.user_friends.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename = 'cohort_members'
       AND policyname = 'Cohort members view cohort'
       AND cmd = 'SELECT'
  ) THEN
    RAISE EXCEPTION 'The own-row SELECT policy "Cohort members view cohort" is missing on public.cohort_members.';
  END IF;
END $$;
