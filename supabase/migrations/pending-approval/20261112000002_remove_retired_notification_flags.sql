-- Post-Phase 3 cleanup: remove the retired ACHIEVEMENT_EMAIL_ENABLED and PORTFOLIO_EMAILS_ENABLED
-- notification flags from the database.
--
-- HELD IN pending-approval/. The Supabase CLI does not read this folder, so nothing here runs on
-- merge. The owner applies it by hand in the Supabase SQL editor.
--
-- Why: no runtime code ever read either flag; they only had defaults and admin toggles. Branch
-- chore/post-phase3-cleanup removes them from DEFAULT_FEATURE_FLAGS and StandardFeatureFlagKey
-- (apps/web/lib/notifications/feature-flags/). The database still carries them, and
-- FeatureFlagService hydrates EVERY key it finds, so without this they would keep showing up in
-- the admin flag list and be written back on every toggle.
--
-- Where flags live: FeatureFlagService reads and writes ONE row, public.system_settings with
-- key = 'feature_flags', whose jsonb value maps flag key to boolean. That is the live store and
-- step 1 below edits it. The older public.notification_feature_flags table (key, description,
-- enabled, updated_at; 20260806000001) is not read by the app; step 2 removes the two keys there
-- too in case rows were ever added by hand.
--
-- APPLY ONLY AFTER the code that drops the two keys is deployed. The previous code seeds its cache
-- from DEFAULT_FEATURE_FLAGS and persists the whole cache whenever an admin toggles any flag, so an
-- old instance would write both keys straight back.
--
-- The previous values are not kept anywhere. Record them first if they matter:
--   SELECT value -> 'ACHIEVEMENT_EMAIL_ENABLED' AS achievement_email,
--          value -> 'PORTFOLIO_EMAILS_ENABLED'  AS portfolio_emails
--   FROM public.system_settings WHERE key = 'feature_flags';
--
-- Afterwards run validation/20261112000002_remove_retired_notification_flags_validation.sql.
-- After applying, redeploy (or restart) all instances, then re-run the validation after the next
-- admin flag toggle. A warm instance may still hold both keys in memory from before the UPDATE;
-- the branch makes hydration rebuild the cache from the row, so a fresh read drops them, and the
-- second validation run proves no toggle wrote them back.
--
-- Idempotent: both statements only touch rows that still carry a retired key. No schema change and
-- nothing granted or revoked.

SET search_path = public, pg_temp;

-- 1. The live store: drop the two keys from the feature_flags jsonb object.
UPDATE public.system_settings
SET value = value - 'ACHIEVEMENT_EMAIL_ENABLED' - 'PORTFOLIO_EMAILS_ENABLED',
    updated_at = now()
WHERE key = 'feature_flags'
  AND jsonb_typeof(value) = 'object'
  AND (value ? 'ACHIEVEMENT_EMAIL_ENABLED' OR value ? 'PORTFOLIO_EMAILS_ENABLED');

-- 2. The legacy table, in case it holds rows for them.
DELETE FROM public.notification_feature_flags
WHERE key IN ('ACHIEVEMENT_EMAIL_ENABLED', 'PORTFOLIO_EMAILS_ENABLED');

-- 3. Self-check.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.system_settings
    WHERE key = 'feature_flags'
      AND jsonb_typeof(value) = 'object'
      AND (value ? 'ACHIEVEMENT_EMAIL_ENABLED' OR value ? 'PORTFOLIO_EMAILS_ENABLED')
  ) THEN
    RAISE EXCEPTION 'system_settings.feature_flags still carries a retired notification flag.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.notification_feature_flags
    WHERE key IN ('ACHIEVEMENT_EMAIL_ENABLED', 'PORTFOLIO_EMAILS_ENABLED')
  ) THEN
    RAISE EXCEPTION 'public.notification_feature_flags still has a retired notification flag row.';
  END IF;
END $$;
