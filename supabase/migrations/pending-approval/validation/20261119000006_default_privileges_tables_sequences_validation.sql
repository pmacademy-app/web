-- Validation for 20261119000006: default privileges for tables and sequences (L2).
--
-- Read-only. Runs inside one transaction and rolls back; it only reads pg_default_acl.
-- Run in the Supabase SQL editor (or psql) as postgres after applying the migration.
-- Query 1 raises on failure and prints "20261119000006 validation passed" on success.
-- Queries 2 and 3 are for the record.

BEGIN;

-- 1. postgres no longer hands anon or authenticated anything on new tables or sequences.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM pg_default_acl d
      CROSS JOIN LATERAL aclexplode(d.defaclacl) a
     WHERE d.defaclrole = 'postgres'::regrole
       AND d.defaclobjtype IN ('r', 'S')
       AND (d.defaclnamespace = 'public'::regnamespace OR d.defaclnamespace = 0)
       AND a.grantee IN ('anon'::regrole, 'authenticated'::regrole)
  ) THEN
    RAISE EXCEPTION '20261119000006 FAILED: postgres default privileges still grant tables or sequences to anon or authenticated';
  END IF;

  -- Functions stay closed too (20261018000001); a regression there would show up here.
  IF EXISTS (
    SELECT 1
      FROM pg_default_acl d
      CROSS JOIN LATERAL aclexplode(d.defaclacl) a
     WHERE d.defaclrole = 'postgres'::regrole
       AND d.defaclobjtype = 'f'
       AND d.defaclnamespace = 'public'::regnamespace
       AND a.grantee IN ('anon'::regrole, 'authenticated'::regrole)
  ) THEN
    RAISE EXCEPTION '20261119000006 FAILED: postgres default privileges grant functions to anon or authenticated (20261018000001 regressed)';
  END IF;

  RAISE NOTICE '20261119000006 validation passed';
END $$;

-- 2. postgres defaults in schema public, one row per grantee (expected: no anon or authenticated
--    for objtype r, S or f).
SELECT d.defaclobjtype AS objtype,
       CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE a.grantee::regrole::text END AS grantee,
       string_agg(a.privilege_type, ', ' ORDER BY a.privilege_type) AS privileges
  FROM pg_default_acl d
  CROSS JOIN LATERAL aclexplode(d.defaclacl) a
 WHERE d.defaclrole = 'postgres'::regrole
   AND d.defaclnamespace = 'public'::regnamespace
 GROUP BY 1, 2
 ORDER BY 1, 2;

-- 3. Every role's defaults that still open new public objects to anon or authenticated. Rows for
--    supabase_admin are expected (postgres cannot change them); they matter only if that role ever
--    creates objects in public.
SELECT d.defaclrole::regrole AS owner_role,
       d.defaclobjtype AS objtype,
       a.grantee::regrole AS grantee,
       string_agg(a.privilege_type, ', ' ORDER BY a.privilege_type) AS privileges
  FROM pg_default_acl d
  CROSS JOIN LATERAL aclexplode(d.defaclacl) a
 WHERE (d.defaclnamespace = 'public'::regnamespace OR d.defaclnamespace = 0)
   AND a.grantee IN ('anon'::regrole, 'authenticated'::regrole)
 GROUP BY 1, 2, 3
 ORDER BY 1, 2, 3;

ROLLBACK;
