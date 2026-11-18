-- Grant allowlist test for schema public (AG-04, plan PR-15, L3).
--
-- Fails when anon, authenticated or PUBLIC holds a privilege in schema public that is not listed
-- below, or when a grant is listed as inert but a policy now makes it reachable. Until L3 this
-- file raised a WARNING and then always passed; it now fails through pgTAP.
--
-- Usage (CI db-local job, and `supabase test db`, which runs every file in supabase/tests):
--   psql "$DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/grant_allowlist.sql
--
-- WHAT IS CHECKED (read from the catalogs, not information_schema, so a table-level grant is not
-- reported once per column):
--   * TABLE    pg_class.relacl (tables, views, matviews): SELECT, INSERT, UPDATE, DELETE.
--              TRUNCATE, REFERENCES and TRIGGER also exist on most tables (legacy Supabase default
--              ALL) but PostgREST cannot reach them, so they are not listed.
--   * COLUMN   pg_attribute.attacl: real column-level grants only.
--   * SEQUENCE pg_class.relacl for sequences (there are none in public today).
--   * FUNCTION pg_proc.proacl entries naming anon or authenticated directly. EXECUTE inherited from
--              PUBLIC is not listed here; rpc_grants.test.sql checks SECURITY DEFINER functions
--              with has_function_privilege, which includes PUBLIC.
--   Objects that belong to an extension are skipped.
--
-- WHICH STATE THIS MATCHES: the CI replay, which is every top-level migration plus the held files
-- in supabase/tests/held-migrations.txt (scripts/ci/apply-held-migrations.sh). The list was taken
-- from the db-local job output of 2026-11-18 (the old WARNING printed every unlisted grant) and
-- checked against the migrations. Production differs where a held migration in that list is not
-- applied yet: until 20261027000002_lock_public_users is applied, production still has INSERT,
-- UPDATE and DELETE on public.users for anon and authenticated, and this test would fail there.
--
-- HOW TO READ AN ENTRY
--   kind 'rls'   a policy grants this role this command; the note says which.
--   kind 'inert' RLS is on and no permissive policy for this role and command exists, so the grant
--                reaches no row. Test 3 fails if such a policy appears. Most of these are leftovers
--                of the legacy default grant (see 20261119000006 for new tables).
--   kind 'gap'   a known over-broad policy. removed_by names the held migration that removes it.
--   removed_by   held migration (pending-approval/) that revokes this grant. When that migration is
--                released or added to held-migrations.txt, delete its rows here in the same commit.
--                Rows left behind do not fail the test (only unlisted grants do), but keep the list
--                honest.
--
-- ADDING A GRANT: add the row here with a justification, in the same migration review.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

SELECT extensions.plan(3);

CREATE TEMP TABLE public_grant_allowlist (
  grantee text NOT NULL,
  object_type text NOT NULL,
  object_name text NOT NULL,
  privilege_type text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('rls', 'inert', 'gap')),
  removed_by text,
  note text NOT NULL
) ON COMMIT DROP;

-- ---------------------------------------------------------------------------------------------
-- 1. Tables. One row per (table, roles, privileges); expanded below.
-- ---------------------------------------------------------------------------------------------
INSERT INTO public_grant_allowlist (grantee, object_type, object_name, privilege_type, kind, removed_by, note)
SELECT g, 'TABLE', t.object_name, p, t.kind, t.removed_by, t.note
  FROM (VALUES
    -- Learner-owned data with own-row policies
    ('users', ARRAY['anon','authenticated'], ARRAY['SELECT'], 'rls', NULL::text,
       'Users can view own profile (own row). Writes revoked by held 20261027000002 (in CI replay).'),
    ('user_lesson_progress', ARRAY['anon','authenticated'], ARRAY['SELECT'], 'rls', NULL,
       'Users view own progress (own row).'),
    ('user_lesson_progress', ARRAY['anon','authenticated'], ARRAY['INSERT','UPDATE','DELETE'], 'inert', NULL,
       'No write policy. Progress is written by the service role (record_lesson_quiz_completion).'),
    ('quiz_attempts', ARRAY['anon','authenticated'], ARRAY['SELECT'], 'rls', NULL,
       'Users view own quiz attempts (own row).'),
    ('quiz_attempts', ARRAY['anon','authenticated'], ARRAY['INSERT','UPDATE','DELETE'], 'inert', NULL,
       'No write policy. Attempts are written by the service role.'),
    ('user_flashcard_srs', ARRAY['anon','authenticated'], ARRAY['SELECT','INSERT','UPDATE','DELETE'], 'rls', NULL,
       'Users manage own flashcard srs (FOR ALL, own row; matches nothing for anon).'),
    ('xp_events', ARRAY['anon','authenticated'], ARRAY['SELECT'], 'rls', NULL,
       'Users view own xp events (own row).'),
    ('xp_events', ARRAY['anon','authenticated'], ARRAY['INSERT','UPDATE','DELETE'], 'inert', NULL,
       'No write policy. The XP ledger is written by the service role only.'),
    ('reflections', ARRAY['authenticated'], ARRAY['SELECT','INSERT','UPDATE','DELETE'], 'rls', NULL,
       'Users manage own reflections (FOR ALL, own row).'),
    ('reflections', ARRAY['anon'], ARRAY['SELECT'], 'gap', '20261119000005_drop_anon_portfolio_policies.sql',
       'L1: Public can view public reflections exposes every is_public row and column to the anon key.'),
    ('reflections', ARRAY['anon'], ARRAY['INSERT','UPDATE','DELETE'], 'rls', '20261119000005_drop_anon_portfolio_policies.sql',
       'Users manage own reflections applies to anon but matches nothing (auth.uid() is null).'),
    ('capstone_submissions', ARRAY['authenticated'], ARRAY['SELECT'], 'rls', NULL,
       'Users view own capstones (own row). Writes revoked in 20261024000002.'),
    ('capstone_submissions', ARRAY['anon'], ARRAY['SELECT'], 'gap', '20261119000005_drop_anon_portfolio_policies.sql',
       'L1: Public can view public capstones exposes every column, review fields included after 20261113000004.'),
    ('user_badges', ARRAY['anon','authenticated'], ARRAY['SELECT'], 'rls', NULL,
       'Users view own badges (own row).'),
    ('user_badges', ARRAY['anon','authenticated'], ARRAY['INSERT','UPDATE','DELETE'], 'inert', NULL,
       'No write policy. Badges are awarded by the service role.'),
    ('certificates', ARRAY['anon','authenticated'], ARRAY['SELECT'], 'rls', NULL,
       'Users can view own certificates (own row). Public verification uses the service role.'),
    ('certificates', ARRAY['anon','authenticated'], ARRAY['INSERT','UPDATE','DELETE'], 'inert', NULL,
       'Insert policy dropped in 20260925000001. Issued by the service role.'),
    ('user_leaderboard_settings', ARRAY['anon','authenticated'], ARRAY['SELECT','INSERT','UPDATE','DELETE'], 'rls', NULL,
       'Users can view/manage own leaderboard settings (own row; matches nothing for anon).'),
    ('user_notification_preferences', ARRAY['anon','authenticated'], ARRAY['SELECT','INSERT','UPDATE'], 'rls', NULL,
       'Users can read/insert/update own preferences (own row; matches nothing for anon).'),
    ('user_notification_preferences', ARRAY['anon','authenticated'], ARRAY['DELETE'], 'inert', NULL,
       'No delete policy.'),
    ('notification_events', ARRAY['anon','authenticated'], ARRAY['SELECT'], 'rls', NULL,
       'Users can read own notification events (own row).'),
    ('notification_events', ARRAY['anon','authenticated'], ARRAY['INSERT','UPDATE','DELETE'], 'inert', NULL,
       'No write policy. Written by the service role.'),
    ('email_queue', ARRAY['anon','authenticated'], ARRAY['SELECT'], 'rls', NULL,
       'Users can read own queued emails (own row).'),
    ('email_queue', ARRAY['anon','authenticated'], ARRAY['INSERT','UPDATE','DELETE'], 'inert', NULL,
       'No write policy. Queue is service-role only.'),
    ('in_app_notifications', ARRAY['anon','authenticated'], ARRAY['SELECT'], 'rls', NULL,
       'Users can read own in-app notifications (own row). UPDATE is column-level, see section 2.'),
    ('in_app_notifications', ARRAY['anon','authenticated'], ARRAY['INSERT','DELETE'], 'inert', NULL,
       'No insert or delete policy. Written by the service role.'),
    ('user_feedback', ARRAY['authenticated'], ARRAY['SELECT','INSERT','UPDATE'], 'rls', NULL,
       'Users can view/insert/update own feedback (TO authenticated).'),
    ('user_feedback', ARRAY['authenticated'], ARRAY['DELETE'], 'inert', NULL,
       'No delete policy.'),
    ('user_feedback', ARRAY['anon'], ARRAY['SELECT','INSERT','UPDATE','DELETE'], 'inert', NULL,
       'Every policy is TO authenticated.'),
    ('user_feedback_prompts', ARRAY['authenticated'], ARRAY['SELECT','INSERT','UPDATE','DELETE'], 'rls', NULL,
       'Users can manage own feedback prompts (FOR ALL TO authenticated, own row).'),
    ('user_feedback_prompts', ARRAY['anon'], ARRAY['SELECT','INSERT','UPDATE','DELETE'], 'inert', NULL,
       'Policy is TO authenticated.'),
    ('user_announcement_dismissals', ARRAY['anon','authenticated'], ARRAY['SELECT','INSERT','UPDATE','DELETE'], 'rls', NULL,
       'Users manage own dismissals (FOR ALL, own row; matches nothing for anon).'),
    ('referrals', ARRAY['authenticated'], ARRAY['SELECT'], 'rls', NULL,
       'Users can view own sent referrals (TO authenticated).'),
    ('referrals', ARRAY['authenticated'], ARRAY['INSERT','UPDATE','DELETE'], 'inert', NULL,
       'No write policy. Written by the service role.'),
    ('referrals', ARRAY['anon'], ARRAY['SELECT','INSERT','UPDATE','DELETE'], 'inert', NULL,
       'Policy is TO authenticated.'),

    -- Public catalogues
    ('badges', ARRAY['anon','authenticated'], ARRAY['SELECT'], 'rls', NULL,
       'Allow read access to badges for everyone (badge definitions).'),
    ('badges', ARRAY['anon','authenticated'], ARRAY['INSERT','UPDATE','DELETE'], 'inert', NULL,
       'No write policy.'),
    ('cohorts', ARRAY['anon','authenticated'], ARRAY['SELECT'], 'rls', NULL,
       'Anyone can view public cohorts (USING true, also lists private cohort names).'),
    ('cohorts', ARRAY['anon','authenticated'], ARRAY['INSERT','UPDATE','DELETE'], 'inert', NULL,
       'No write policy.'),
    ('testimonials', ARRAY['anon','authenticated'], ARRAY['SELECT'], 'rls', NULL,
       'Public can read published testimonials; authenticated also sees own rows.'),
    ('testimonials', ARRAY['anon','authenticated'], ARRAY['INSERT','UPDATE','DELETE'], 'inert', NULL,
       'Insert policy dropped in 20261018000001. Written by the service role.'),

    -- Cohort membership and friends (M6)
    ('cohort_members', ARRAY['authenticated'], ARRAY['SELECT'], 'gap', NULL,
       'M6: Users can view cohort members is USING (true). After 20261119000004 only the own-row policy remains and this row becomes rls.'),
    ('cohort_members', ARRAY['anon'], ARRAY['SELECT'], 'gap', '20261119000004_cohort_members_and_friends_lockdown.sql',
       'M6: anon reads every membership through USING (true).'),
    ('cohort_members', ARRAY['anon','authenticated'], ARRAY['INSERT','DELETE'], 'gap', '20261119000004_cohort_members_and_friends_lockdown.sql',
       'M6: Users can join cohorts (any cohort, private included) / leave cohorts.'),
    ('cohort_members', ARRAY['anon','authenticated'], ARRAY['UPDATE'], 'inert', '20261119000004_cohort_members_and_friends_lockdown.sql',
       'No update policy.'),
    ('user_friends', ARRAY['anon','authenticated'], ARRAY['SELECT','INSERT','DELETE'], 'gap', '20261119000004_cohort_members_and_friends_lockdown.sql',
       'M6: Users can add friends accepts any friend_id with status accepted. App uses the service role.'),
    ('user_friends', ARRAY['anon','authenticated'], ARRAY['UPDATE'], 'inert', '20261119000004_cohort_members_and_friends_lockdown.sql',
       'No update policy.'),

    -- Contact messages (M2)
    ('contact_messages', ARRAY['anon','authenticated'], ARRAY['INSERT'], 'gap', '20261119000001_contact_messages_service_only.sql',
       'M2: Anyone can insert contact message (TO public). /api/contact uses the service role.'),
    ('contact_messages', ARRAY['authenticated'], ARRAY['SELECT'], 'rls', NULL,
       'Users can view own contact messages (TO authenticated, own row). Kept by 20261119000001.'),
    ('contact_messages', ARRAY['anon'], ARRAY['SELECT'], 'inert', '20261119000001_contact_messages_service_only.sql',
       'SELECT policy is TO authenticated.'),
    ('contact_messages', ARRAY['anon','authenticated'], ARRAY['UPDATE','DELETE'], 'inert', '20261119000001_contact_messages_service_only.sql',
       'No update or delete policy.'),

    -- System announcements (M3)
    ('system_announcements', ARRAY['anon','authenticated'], ARRAY['SELECT'], 'gap', '20261119000002_system_announcements_service_only.sql',
       'M3: Active announcements viewable by all has no audience filter (individual and cohort announcements leak).'),
    ('system_announcements', ARRAY['anon','authenticated'], ARRAY['INSERT','UPDATE','DELETE'], 'rls', '20261119000002_system_announcements_service_only.sql',
       'Admins manage announcements (FOR ALL, admin check). Unused: admins go through the service role.'),

    -- Admin-only tables reachable with an admin token
    ('admin_audit_logs', ARRAY['authenticated'], ARRAY['SELECT'], 'rls', NULL,
       'Admins can read audit logs (TO authenticated, is_admin check).'),
    ('admin_audit_logs', ARRAY['authenticated'], ARRAY['INSERT','UPDATE','DELETE'], 'inert', NULL,
       'No write policy. Written by the service role.'),
    ('admin_audit_logs', ARRAY['anon'], ARRAY['SELECT','INSERT','UPDATE','DELETE'], 'inert', NULL,
       'Policy is TO authenticated.'),
    ('system_errors', ARRAY['anon','authenticated'], ARRAY['SELECT','UPDATE'], 'rls', NULL,
       'Admins can select/update system_errors (is_admin check; matches nothing for anon).'),
    ('system_errors', ARRAY['anon','authenticated'], ARRAY['INSERT','DELETE'], 'inert', NULL,
       'No insert or delete policy.'),
    ('in_app_broadcasts', ARRAY['authenticated'], ARRAY['SELECT','INSERT','UPDATE','DELETE'], 'rls', NULL,
       'Admins manage in_app_broadcasts (FOR ALL TO authenticated, is_admin check).'),
    ('in_app_broadcasts', ARRAY['anon'], ARRAY['SELECT','INSERT','UPDATE','DELETE'], 'inert', NULL,
       'Policy is TO authenticated.'),

    -- Service-role-only tables: RLS on, no policy at all. Leftover legacy default grants.
    ('email_delivery_events', ARRAY['anon','authenticated'], ARRAY['SELECT','INSERT','UPDATE','DELETE'], 'inert', NULL,
       'Service role only. No policy.'),
    ('email_suppressions', ARRAY['anon','authenticated'], ARRAY['SELECT','INSERT','UPDATE','DELETE'], 'inert', NULL,
       'Service role only. No policy.'),
    ('email_send_ledger', ARRAY['anon','authenticated'], ARRAY['SELECT','INSERT','UPDATE','DELETE'], 'inert', NULL,
       'Service role only. No policy (20260909000001 says so on purpose).'),
    ('email_provider_quota', ARRAY['anon','authenticated'], ARRAY['SELECT','INSERT','UPDATE','DELETE'], 'inert', NULL,
       'Service role only. No policy.'),
    ('notification_feature_flags', ARRAY['anon','authenticated'], ARRAY['SELECT','INSERT','UPDATE','DELETE'], 'inert', NULL,
       'Service role only. No policy.'),
    ('notification_templates', ARRAY['anon','authenticated'], ARRAY['SELECT','INSERT','UPDATE','DELETE'], 'inert', NULL,
       'Service role only. No policy.'),
    ('notification_template_versions', ARRAY['anon','authenticated'], ARRAY['SELECT','INSERT','UPDATE','DELETE'], 'inert', NULL,
       'Service role only. No policy.'),
    ('system_settings', ARRAY['anon','authenticated'], ARRAY['SELECT','INSERT','UPDATE','DELETE'], 'inert', NULL,
       'Service role only. No policy.'),
    ('rate_limits', ARRAY['anon','authenticated'], ARRAY['SELECT','INSERT','UPDATE','DELETE'], 'inert', NULL,
       'Service role only. No policy.')
  ) AS t(object_name, grantees, privs, kind, removed_by, note)
  CROSS JOIN LATERAL unnest(t.grantees) AS g
  CROSS JOIN LATERAL unnest(t.privs) AS p;

-- Not listed on purpose (no anon or authenticated grant in the replay): email_broadcasts,
-- fellow_requests (20261018000001), product_events and the weekly_* views (20261024000001).

-- ---------------------------------------------------------------------------------------------
-- 2. Column-level grants
-- ---------------------------------------------------------------------------------------------
INSERT INTO public_grant_allowlist (grantee, object_type, object_name, privilege_type, kind, removed_by, note) VALUES
  ('authenticated', 'COLUMN', 'in_app_notifications.is_read', 'UPDATE', 'rls', NULL,
     'Users can update own in-app notifications; column grant limits it to the read state (20261013000002).'),
  ('authenticated', 'COLUMN', 'in_app_notifications.read_at', 'UPDATE', 'rls', NULL,
     'As above.');

-- ---------------------------------------------------------------------------------------------
-- 3. Functions (direct grants to anon or authenticated)
-- ---------------------------------------------------------------------------------------------
-- Both predate 20261018000001 and kept the legacy default EXECUTE. Neither is SECURITY DEFINER and
-- neither reads data: calculate_user_level(int) is a pure lookup, and calling the trigger function
-- guard_privileged_user_columns() directly raises. TODO: revoke both in a later held migration.
INSERT INTO public_grant_allowlist (grantee, object_type, object_name, privilege_type, kind, removed_by, note)
SELECT g, 'FUNCTION', f, 'EXECUTE', 'inert', NULL, 'Known legacy default EXECUTE, harmless (see comment above).'
  FROM unnest(ARRAY['anon', 'authenticated']) AS g
  CROSS JOIN unnest(ARRAY['calculate_user_level', 'guard_privileged_user_columns']) AS f;

-- ---------------------------------------------------------------------------------------------
-- Actual grants, read from the catalogs
-- ---------------------------------------------------------------------------------------------
CREATE TEMP VIEW public_actual_grants AS
WITH roles AS (
  SELECT oid, rolname::text AS rolname FROM pg_roles WHERE rolname IN ('anon', 'authenticated')
  UNION ALL
  SELECT 0::oid, 'PUBLIC'
),
rels AS (
  SELECT c.oid, c.relname, c.relkind, c.relacl, c.relrowsecurity
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public'
     AND c.relkind IN ('r', 'p', 'v', 'm', 'f', 'S')
     AND NOT EXISTS (
       SELECT 1 FROM pg_depend d
        WHERE d.classid = 'pg_class'::regclass AND d.objid = c.oid AND d.deptype = 'e'
     )
)
SELECT r.rolname AS grantee,
       CASE WHEN rel.relkind = 'S' THEN 'SEQUENCE' ELSE 'TABLE' END AS object_type,
       rel.relname::text AS object_name,
       a.privilege_type
  FROM rels rel
  CROSS JOIN LATERAL aclexplode(rel.relacl) a
  JOIN roles r ON r.oid = a.grantee
 WHERE (rel.relkind <> 'S' AND a.privilege_type IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE'))
    OR (rel.relkind = 'S' AND a.privilege_type IN ('USAGE', 'SELECT', 'UPDATE'))
UNION ALL
SELECT r.rolname,
       'COLUMN',
       rel.relname::text || '.' || att.attname::text,
       a.privilege_type
  FROM rels rel
  JOIN pg_attribute att ON att.attrelid = rel.oid AND att.attnum > 0 AND NOT att.attisdropped
  CROSS JOIN LATERAL aclexplode(att.attacl) a
  JOIN roles r ON r.oid = a.grantee
 WHERE a.privilege_type IN ('SELECT', 'INSERT', 'UPDATE')
UNION ALL
SELECT r.rolname,
       'FUNCTION',
       p.proname::text,
       a.privilege_type
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace AND n.nspname = 'public'
  CROSS JOIN LATERAL aclexplode(p.proacl) a
  JOIN roles r ON r.oid = a.grantee AND r.rolname IN ('anon', 'authenticated')
 WHERE NOT EXISTS (
   SELECT 1 FROM pg_depend d
    WHERE d.classid = 'pg_proc'::regclass AND d.objid = p.oid AND d.deptype = 'e'
 );

-- ---------------------------------------------------------------------------------------------
-- Test 1: every actual grant is on the allowlist.
-- On failure pgTAP prints the unlisted rows. Either revoke the grant or add a justified row above.
-- ---------------------------------------------------------------------------------------------
SELECT extensions.is_empty(
  $$
  SELECT g.grantee || ' ' || g.privilege_type || ' on ' || g.object_type || ' public.' || g.object_name
    FROM public_actual_grants g
   WHERE NOT EXISTS (
     SELECT 1 FROM public_grant_allowlist a
      WHERE a.grantee = g.grantee
        AND a.object_type = g.object_type
        AND a.object_name = g.object_name
        AND a.privilege_type = g.privilege_type
   )
   ORDER BY 1
  $$,
  'every anon/authenticated/PUBLIC privilege in schema public is on the allowlist'
);

-- ---------------------------------------------------------------------------------------------
-- Test 2: no table or view that anon or authenticated can reach has row level security off.
-- Views run as their owner and skip RLS on the base table, so a granted view is listed too.
-- ---------------------------------------------------------------------------------------------
SELECT extensions.is_empty(
  $$
  SELECT DISTINCT c.relname::text || ' (' || c.relkind::text || ')'
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
    JOIN public_actual_grants g ON g.object_type = 'TABLE' AND g.object_name = c.relname::text
   WHERE c.relkind IN ('r', 'p', 'v', 'm', 'f')
     AND (c.relkind <> 'r' AND c.relkind <> 'p' OR NOT c.relrowsecurity)
   ORDER BY 1
  $$,
  'every table anon/authenticated can reach has row level security enabled, and no view or matview is granted to them'
);

-- ---------------------------------------------------------------------------------------------
-- Test 3: grants listed as inert really are inert: no permissive policy for that role and
-- command exists. If this fails, a policy now makes the grant reachable: re-classify the row
-- (with a justification) or drop the policy.
-- ---------------------------------------------------------------------------------------------
SELECT extensions.is_empty(
  $$
  SELECT a.grantee || ' ' || a.privilege_type || ' on public.' || a.object_name || ' via policy "' || p.policyname || '"'
    FROM public_grant_allowlist a
    JOIN pg_policies p
      ON p.schemaname = 'public'
     AND p.tablename = a.object_name
     AND (p.cmd = a.privilege_type OR p.cmd = 'ALL')
     AND p.permissive = 'PERMISSIVE'
     AND p.roles && ARRAY['public', a.grantee]::name[]
   WHERE a.kind = 'inert'
     AND a.object_type = 'TABLE'
   ORDER BY 1
  $$,
  'grants listed as inert are not reachable through any permissive policy'
);

SELECT * FROM extensions.finish();

ROLLBACK;
