-- M3: public.system_announcements is read and written only through the service role.
--
-- HELD IN pending-approval/. The Supabase CLI does not read this folder, so nothing here runs on
-- merge. The owner applies it by hand in the Supabase SQL editor.
--
-- Why: "Active announcements viewable by all" (20260822000001_system_announcements_and_perf.sql:80-87)
-- has no TO clause and filters only on status and the schedule window, not on the audience. Anyone
-- with the public anon key can therefore read every active announcement, including the ones aimed
-- at a single learner (target_audience = 'individual', target_user_id) or at one cohort
-- (target_audience = 'cohort', target_cohort_id), together with target_user_id and created_by.
--
-- Fix chosen: drop client access entirely instead of writing an audience filter.
--   * The app never reads or writes this table with a learner or anon token. Every call goes
--     through createServiceRoleClient() in lib/admin/announcements-service.ts (admin CRUD and
--     getActiveAnnouncements, which does the audience filtering in memory for the learner).
--   * An RLS audience filter would have to join cohort membership, and target_cohort_id is `text`
--     while cohorts.id and cohort_members.cohort_id are `uuid`, so the filter needs casts that can
--     fail on bad data and duplicates logic the service already owns. Removing the grant is
--     simpler, cannot drift from the app, and leaves nothing to get wrong.
--   * "Admins manage announcements" (FOR ALL, admin check through public.users) is dropped too:
--     admins also go through the service role, and keeping a write policy for a table no client
--     touches only widens what a stolen admin token can do through PostgREST.
--
-- This migration:
--   1. Drops both policies on public.system_announcements.
--   2. REVOKEs ALL on public.system_announcements from PUBLIC, anon and authenticated.
--   public.user_announcement_dismissals is not changed (own-row policy only).
--
-- Idempotent: DROP POLICY IF EXISTS, REVOKE and the self-check can all be re-run. No data is
-- changed. Nothing here grants anything to anon or authenticated.
-- Rollback: rollback/20261119000002_system_announcements_service_only.down.sql (next to this file).
-- Validation: validation/20261119000002_system_announcements_service_only_validation.sql.

SET search_path = public, pg_temp;

DROP POLICY IF EXISTS "Active announcements viewable by all" ON public.system_announcements;
DROP POLICY IF EXISTS "Admins manage announcements" ON public.system_announcements;

REVOKE ALL ON public.system_announcements FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Self-check
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_role text;
BEGIN
  FOREACH v_role IN ARRAY ARRAY['public', 'anon', 'authenticated'] LOOP
    IF has_table_privilege(v_role, 'public.system_announcements', 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER')
       OR has_any_column_privilege(v_role, 'public.system_announcements', 'SELECT, INSERT, UPDATE, REFERENCES') THEN
      RAISE EXCEPTION '% still holds a privilege on public.system_announcements. Look up the grantor in information_schema.role_table_grants and column_privileges, run REVOKE as that role, then apply this migration again.', v_role;
    END IF;
  END LOOP;

  IF NOT has_table_privilege('service_role', 'public.system_announcements', 'SELECT, INSERT, UPDATE, DELETE') THEN
    RAISE EXCEPTION 'service_role cannot read and write public.system_announcements. lib/admin/announcements-service.ts needs it.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename = 'system_announcements'
  ) THEN
    RAISE EXCEPTION 'A policy is still present on public.system_announcements.';
  END IF;

  -- RLS stays on, so a grant added by mistake later still exposes nothing without a policy.
  IF NOT EXISTS (
    SELECT 1 FROM pg_class
     WHERE oid = 'public.system_announcements'::regclass
       AND relrowsecurity
  ) THEN
    RAISE EXCEPTION 'Row level security is off on public.system_announcements.';
  END IF;
END $$;
