-- Validation for 20261119000004: cohort_members and user_friends lockdown (M6).
--
-- Read-only. Runs inside one transaction and rolls back; it only reads the catalog.
-- Run in the Supabase SQL editor (or psql) as postgres after applying the migration.
-- Every check raises on failure. Success prints "20261119000004 validation passed".

BEGIN;

DO $$
DECLARE
  v_role text;
  v_priv text;
BEGIN
  FOREACH v_role IN ARRAY ARRAY['public', 'anon', 'authenticated'] LOOP
    FOREACH v_priv IN ARRAY ARRAY['INSERT', 'UPDATE', 'DELETE'] LOOP
      IF has_table_privilege(v_role, 'public.cohort_members', v_priv) THEN
        RAISE EXCEPTION '20261119000004 FAILED: % has % on public.cohort_members', v_role, v_priv;
      END IF;
    END LOOP;
    FOREACH v_priv IN ARRAY ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE'] LOOP
      IF has_table_privilege(v_role, 'public.user_friends', v_priv) THEN
        RAISE EXCEPTION '20261119000004 FAILED: % has % on public.user_friends', v_role, v_priv;
      END IF;
    END LOOP;
  END LOOP;

  IF has_table_privilege('anon', 'public.cohort_members', 'SELECT') THEN
    RAISE EXCEPTION '20261119000004 FAILED: anon can SELECT public.cohort_members';
  END IF;

  IF NOT has_table_privilege('service_role', 'public.cohort_members', 'SELECT, INSERT, DELETE')
     OR NOT has_table_privilege('service_role', 'public.user_friends', 'SELECT, INSERT, DELETE') THEN
    RAISE EXCEPTION '20261119000004 FAILED: service_role lost access to cohort_members or user_friends';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public'
       AND policyname IN (
         'Users can view cohort members', 'Users can join cohorts', 'Users can leave cohorts',
         'Users can view their friends', 'Users can add friends', 'Users can remove friends'
       )
  ) THEN
    RAISE EXCEPTION '20261119000004 FAILED: a dropped policy is still present';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename = 'cohort_members'
       AND policyname = 'Cohort members view cohort'
  ) THEN
    RAISE EXCEPTION '20261119000004 FAILED: own-row policy "Cohort members view cohort" is missing';
  END IF;

  RAISE NOTICE '20261119000004 validation passed';
END $$;

ROLLBACK;
