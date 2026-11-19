-- L2: tables and sequences that postgres creates in schema public from now on start closed to
-- anon and authenticated.
--
-- HELD IN pending-approval/. The Supabase CLI does not read this folder, so nothing here runs on
-- merge. The owner applies it by hand in the Supabase SQL editor.
--
-- Why: Supabase's legacy default privileges grant ALL on every new table and sequence in schema
-- public to anon and authenticated. Every table in this project therefore started readable and
-- writable by the anon key until RLS and a REVOKE caught up, which is how most findings in the
-- November 2026 review began (contact_messages, system_announcements, cohort_members,
-- user_friends). 20261018000001_lockdown_public_grants.sql closed the same default for functions
-- only. This does the same for tables and sequences.
--
-- Scope and limits:
--   * Only objects created by the postgres role. That covers `supabase db push`, the SQL editor and
--     the dashboard table editor. postgres cannot change the defaults of supabase_admin (it is not a
--     member of that role); supabase_admin creates no tables in public in this project (no
--     extension is installed in public). Validation query 3 lists every role's defaults for review.
--   * Existing tables and sequences keep their grants. Nothing is revoked from an existing object.
--   * service_role keeps its default grant, so server code can still use a new table at once.
--   * Views are covered (they use the TABLES default).
--
-- Effect on future migrations: a new table that learners must read or write through PostgREST
-- needs an explicit GRANT to anon and/or authenticated in the same migration, plus RLS policies,
-- plus an entry in supabase/tests/grant_allowlist.sql. No app flow depends on the old default:
-- every table the app reads with a learner token already exists and keeps its grants, and no held
-- migration creates a table in public.
--
-- Idempotent: ALTER DEFAULT PRIVILEGES ... REVOKE and the self-check can be re-run. No data or
-- existing object is changed. Nothing here grants anything to anon or authenticated.
-- Rollback: rollback/20261119000006_default_privileges_tables_sequences.down.sql (next to this file).
-- Validation: validation/20261119000006_default_privileges_tables_sequences_validation.sql.

SET search_path = public, pg_temp;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated;

-- ---------------------------------------------------------------------------
-- Self-check
-- ---------------------------------------------------------------------------
-- Read pg_default_acl directly. A per-schema REVOKE cannot remove a grant that comes from a global
-- (all-schemas) default entry, so check both.
DO $$
DECLARE
  v_hit text;
BEGIN
  SELECT format('%s on %s (%s)',
                a.grantee::regrole::text,
                CASE d.defaclobjtype WHEN 'r' THEN 'TABLES' ELSE 'SEQUENCES' END,
                CASE WHEN d.defaclnamespace = 0 THEN 'all schemas' ELSE 'schema public' END)
    INTO v_hit
    FROM pg_default_acl d
    CROSS JOIN LATERAL aclexplode(d.defaclacl) a
   WHERE d.defaclrole = 'postgres'::regrole
     AND d.defaclobjtype IN ('r', 'S')
     AND (d.defaclnamespace = 'public'::regnamespace OR d.defaclnamespace = 0)
     AND a.grantee IN ('anon'::regrole, 'authenticated'::regrole)
   LIMIT 1;

  IF v_hit IS NOT NULL THEN
    RAISE EXCEPTION 'postgres default privileges still grant %. A global entry needs ALTER DEFAULT PRIVILEGES FOR ROLE postgres REVOKE ALL ON TABLES/SEQUENCES FROM anon, authenticated (without IN SCHEMA).', v_hit;
  END IF;

  -- Not something this migration changes, so a warning, not an error: without a service_role
  -- default, every new table also needs an explicit GRANT to service_role.
  IF NOT EXISTS (
    SELECT 1
      FROM pg_default_acl d
      CROSS JOIN LATERAL aclexplode(d.defaclacl) a
     WHERE d.defaclrole = 'postgres'::regrole
       AND d.defaclobjtype = 'r'
       AND d.defaclnamespace = 'public'::regnamespace
       AND a.grantee = 'service_role'::regrole
  ) THEN
    RAISE WARNING 'postgres has no default TABLES grant to service_role in schema public. New tables need an explicit GRANT to service_role.';
  END IF;
END $$;
