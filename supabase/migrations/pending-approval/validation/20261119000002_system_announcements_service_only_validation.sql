-- Validation for 20261119000002: public.system_announcements service-role only (M3).
--
-- Read-only. Runs inside one transaction and rolls back; it only reads the catalog.
-- Run in the Supabase SQL editor (or psql) as postgres after applying the migration.
-- Every check raises on failure. Success prints "20261119000002 validation passed".

BEGIN;

DO $$
DECLARE
  v_role text;
  v_priv text;
BEGIN
  FOREACH v_role IN ARRAY ARRAY['public', 'anon', 'authenticated'] LOOP
    FOREACH v_priv IN ARRAY ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE'] LOOP
      IF has_table_privilege(v_role, 'public.system_announcements', v_priv) THEN
        RAISE EXCEPTION '20261119000002 FAILED: % has % on public.system_announcements', v_role, v_priv;
      END IF;
    END LOOP;
    IF has_any_column_privilege(v_role, 'public.system_announcements', 'SELECT, INSERT, UPDATE') THEN
      RAISE EXCEPTION '20261119000002 FAILED: % has a column-level grant on public.system_announcements', v_role;
    END IF;
  END LOOP;

  IF NOT has_table_privilege('service_role', 'public.system_announcements', 'SELECT, INSERT, UPDATE, DELETE') THEN
    RAISE EXCEPTION '20261119000002 FAILED: service_role lost access to public.system_announcements';
  END IF;

  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'system_announcements') THEN
    RAISE EXCEPTION '20261119000002 FAILED: a policy is still present on public.system_announcements';
  END IF;

  -- The dismissals table is untouched: learners keep their own-row policy.
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename = 'user_announcement_dismissals'
       AND policyname = 'Users manage own dismissals'
  ) THEN
    RAISE EXCEPTION '20261119000002 FAILED: "Users manage own dismissals" is missing (this migration must not touch it)';
  END IF;

  RAISE NOTICE '20261119000002 validation passed';
END $$;

ROLLBACK;
