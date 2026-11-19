-- Validation for 20261119000001: public.contact_messages service-role only (M2).
--
-- Read-only. Runs inside one transaction and rolls back; it only reads the catalog.
-- Run in the Supabase SQL editor (or psql) as postgres after applying the migration.
-- Every check raises on failure. Success prints "20261119000001 validation passed".

BEGIN;

DO $$
DECLARE
  v_role text;
BEGIN
  FOREACH v_role IN ARRAY ARRAY['public', 'anon', 'authenticated'] LOOP
    IF has_table_privilege(v_role, 'public.contact_messages', 'INSERT')
       OR has_table_privilege(v_role, 'public.contact_messages', 'UPDATE')
       OR has_table_privilege(v_role, 'public.contact_messages', 'DELETE')
       OR has_any_column_privilege(v_role, 'public.contact_messages', 'INSERT, UPDATE') THEN
      RAISE EXCEPTION '20261119000001 FAILED: % can write public.contact_messages', v_role;
    END IF;
  END LOOP;

  IF has_table_privilege('anon', 'public.contact_messages', 'SELECT') THEN
    RAISE EXCEPTION '20261119000001 FAILED: anon can SELECT public.contact_messages';
  END IF;

  IF NOT has_table_privilege('service_role', 'public.contact_messages', 'SELECT, INSERT, UPDATE') THEN
    RAISE EXCEPTION '20261119000001 FAILED: service_role lost access to public.contact_messages';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename = 'contact_messages'
       AND policyname = 'Anyone can insert contact message'
  ) THEN
    RAISE EXCEPTION '20261119000001 FAILED: "Anyone can insert contact message" is still present';
  END IF;

  RAISE NOTICE '20261119000001 validation passed';
END $$;

-- For the record: the policies left on the table (expected: only the authenticated own-row SELECT).
SELECT policyname, cmd, roles, qual
  FROM pg_policies
 WHERE schemaname = 'public' AND tablename = 'contact_messages'
 ORDER BY policyname;

ROLLBACK;
