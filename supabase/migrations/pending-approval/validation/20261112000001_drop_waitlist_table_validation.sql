-- Validation for 20261112000001: public.waitlist is dropped.
--
-- READ-ONLY, safe on production. Run it AFTER applying the forward migration. It runs inside one
-- transaction that ends with ROLLBACK, so it changes nothing.
--
-- Usage: paste into the Supabase SQL editor and run it, or
--   psql "$DB_URL" -v ON_ERROR_STOP=1 -f supabase/migrations/pending-approval/validation/20261112000001_drop_waitlist_table_validation.sql
--
-- Raises on failure. Success prints "20261112000001 validation passed".

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.waitlist') IS NOT NULL THEN
    RAISE EXCEPTION '20261112000001 FAILED: public.waitlist still exists';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'waitlist'
  ) THEN
    RAISE EXCEPTION '20261112000001 FAILED: a policy on public.waitlist is still registered';
  END IF;

  RAISE NOTICE '20261112000001 validation passed';
END $$;

ROLLBACK;
