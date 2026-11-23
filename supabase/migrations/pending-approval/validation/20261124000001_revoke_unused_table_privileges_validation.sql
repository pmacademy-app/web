-- Validation for 20261124000001: unused table privileges (TRUNCATE, REFERENCES, TRIGGER).
--
-- Read-only. Runs inside one transaction and rolls back; it only reads the catalog.
-- Run in the Supabase SQL editor (or psql) as postgres after applying the migration.
-- Query 1 raises on failure and prints "20261124000001 validation passed" on success.
-- Query 2 is for the record.

BEGIN;

-- 1. No table or view in public grants TRUNCATE, REFERENCES or TRIGGER to anon, authenticated or
--    PUBLIC, and service_role still has them.
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
    RAISE EXCEPTION '20261124000001 FAILED: still granted: %', v_hit;
  END IF;

  IF NOT has_table_privilege('service_role', 'public.users', 'TRUNCATE') THEN
    RAISE EXCEPTION '20261124000001 FAILED: service_role lost TRUNCATE on public.users';
  END IF;

  RAISE NOTICE '20261124000001 validation passed';
END $$;

-- 2. What anon and authenticated still hold on public.users (expected: SELECT only).
SELECT grantee, string_agg(privilege_type, ', ' ORDER BY privilege_type) AS privileges
  FROM information_schema.role_table_grants
 WHERE table_schema = 'public' AND table_name = 'users' AND grantee IN ('anon', 'authenticated')
 GROUP BY grantee
 ORDER BY grantee;

ROLLBACK;
