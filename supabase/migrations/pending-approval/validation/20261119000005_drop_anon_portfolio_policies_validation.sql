-- Validation for 20261119000005: drop anon portfolio policies (L1).
--
-- Read-only. Runs inside one transaction and rolls back; it only reads the catalog.
-- Run in the Supabase SQL editor (or psql) as postgres after applying the migration.
-- Every check raises on failure. Success prints "20261119000005 validation passed".
--
-- Manual follow-up (not SQL): open a public portfolio page (/p/<username> and
-- /p/<username>/capstones/<moduleSlug>) while signed out and confirm capstones and reflections
-- still render. They are loaded with the service role, so they should.

BEGIN;

DO $$
DECLARE
  v_role text;
  v_table text;
BEGIN
  FOREACH v_role IN ARRAY ARRAY['public', 'anon'] LOOP
    FOREACH v_table IN ARRAY ARRAY['public.capstone_submissions', 'public.reflections'] LOOP
      IF has_table_privilege(v_role, v_table, 'SELECT') THEN
        RAISE EXCEPTION '20261119000005 FAILED: % can SELECT %', v_role, v_table;
      END IF;
      IF has_any_column_privilege(v_role, v_table, 'SELECT') THEN
        RAISE EXCEPTION '20261119000005 FAILED: % has a column-level SELECT on %', v_role, v_table;
      END IF;
    END LOOP;
  END LOOP;

  IF EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public'
       AND policyname IN ('Public can view public capstones', 'Public can view public reflections')
  ) THEN
    RAISE EXCEPTION '20261119000005 FAILED: a public portfolio policy is still present';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'capstone_submissions' AND policyname = 'Users view own capstones'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'reflections'
       -- 20261121000001 replaced the FOR ALL "Users manage own reflections" with the
       -- select-only "Users can view own reflections"; either is the learner's own-row read.
       AND policyname IN ('Users manage own reflections', 'Users can view own reflections')
  ) THEN
    RAISE EXCEPTION '20261119000005 FAILED: a learner own-row policy is missing (this migration must not drop it)';
  END IF;

  RAISE NOTICE '20261119000005 validation passed';
END $$;

ROLLBACK;
