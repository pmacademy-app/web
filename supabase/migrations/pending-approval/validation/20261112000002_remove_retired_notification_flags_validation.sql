-- Validation for 20261112000002: the retired notification flags are gone from the database.
--
-- READ-ONLY, safe on production. Run it AFTER applying the forward migration. It runs inside one
-- transaction that ends with ROLLBACK, so it changes nothing.
--
-- Usage: paste into the Supabase SQL editor and run it, or
--   psql "$DB_URL" -v ON_ERROR_STOP=1 -f supabase/migrations/pending-approval/validation/20261112000002_remove_retired_notification_flags_validation.sql
--
-- Raises on failure. Success prints "20261112000002 validation passed".

BEGIN;

DO $$
DECLARE
  v_settings integer;
  v_legacy integer;
BEGIN
  SELECT count(*) INTO v_settings
  FROM public.system_settings
  WHERE key = 'feature_flags'
    AND jsonb_typeof(value) = 'object'
    AND (value ? 'ACHIEVEMENT_EMAIL_ENABLED' OR value ? 'PORTFOLIO_EMAILS_ENABLED');

  IF v_settings <> 0 THEN
    RAISE EXCEPTION '20261112000002 FAILED: system_settings.feature_flags still carries a retired flag';
  END IF;

  SELECT count(*) INTO v_legacy
  FROM public.notification_feature_flags
  WHERE key IN ('ACHIEVEMENT_EMAIL_ENABLED', 'PORTFOLIO_EMAILS_ENABLED');

  IF v_legacy <> 0 THEN
    RAISE EXCEPTION '20261112000002 FAILED: % retired flag row(s) left in public.notification_feature_flags', v_legacy;
  END IF;

  RAISE NOTICE '20261112000002 validation passed';
END $$;

ROLLBACK;
