-- Revoke the unused legacy table privileges TRUNCATE, REFERENCES and TRIGGER from anon and
-- authenticated on every table and view in schema public.
--
-- HELD IN pending-approval/. The Supabase CLI does not read this folder, so nothing here runs on
-- merge. The owner applies it by hand in the Supabase SQL editor.
--
-- Why: the production check of 2026-11-24 showed anon and authenticated still hold REFERENCES,
-- SELECT, TRIGGER and TRUNCATE on public.users. 20261027000002_lock_public_users removed the write
-- privileges; these three are what is left of Supabase's legacy default GRANT ALL, and the same
-- leftover exists on most tables. PostgREST cannot issue TRUNCATE, CREATE TRIGGER or a foreign key,
-- and neither role can log in to Postgres directly, so none of them is reachable today. They are
-- removed anyway because TRUNCATE ignores row level security: any future path that ran SQL as one
-- of these roles (a SECURITY INVOKER function, a misconfigured pooler login) could empty a table.
-- supabase/tests/grant_allowlist.sql does not track these three, so no allowlist row changes.
--
-- Scope and limits:
--   * Tables, partitioned tables, views, materialized views and foreign tables in schema public.
--     SELECT, INSERT, UPDATE and DELETE are not touched; RLS and the allowlist govern them.
--   * Only grants made by postgres are revoked (REVOKE removes the caller's own grants). The
--     self-check below raises if any of the three is still held afterwards, whoever granted it.
--   * service_role and postgres keep everything. No app flow uses these privileges: the app reads
--     and writes through PostgREST, and server code uses the service role.
--   * New tables already start closed (20261119000006).
--
-- Idempotent: re-running revokes nothing new and the self-check passes again. No data is changed.
-- Rollback: rollback/20261124000001_revoke_unused_table_privileges.down.sql (next to this file).
-- Validation: validation/20261124000001_revoke_unused_table_privileges_validation.sql.

SET search_path = public, pg_temp;

REVOKE TRUNCATE, REFERENCES, TRIGGER ON ALL TABLES IN SCHEMA public FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Self-check
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_hit text;
BEGIN
  SELECT format('%s %s on public.%s', a.grantee::regrole::text, a.privilege_type, c.relname)
    INTO v_hit
    FROM pg_class c
    CROSS JOIN LATERAL aclexplode(c.relacl) a
   WHERE c.relnamespace = 'public'::regnamespace
     AND c.relkind IN ('r', 'p', 'v', 'm', 'f')
     AND a.privilege_type IN ('TRUNCATE', 'REFERENCES', 'TRIGGER')
     AND (a.grantee = 0 OR a.grantee IN ('anon'::regrole, 'authenticated'::regrole))
     AND NOT EXISTS (
       SELECT 1 FROM pg_depend d
        WHERE d.classid = 'pg_class'::regclass AND d.objid = c.oid AND d.deptype = 'e'
     )
   LIMIT 1;

  IF v_hit IS NOT NULL THEN
    RAISE EXCEPTION 'Still granted: %. It was granted by a role other than postgres; revoke it as that role.', v_hit;
  END IF;
END $$;
