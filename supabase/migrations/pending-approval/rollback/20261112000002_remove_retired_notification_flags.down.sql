-- Rollback for 20261112000002: put ACHIEVEMENT_EMAIL_ENABLED and PORTFOLIO_EMAILS_ENABLED back.
--
-- THE PREVIOUS VALUES ARE UNRECOVERABLE. The forward migration does not keep them, so both keys
-- come back as enabled = true, which was their default in DEFAULT_FEATURE_FLAGS. If the owner
-- recorded the old values before applying, set them by hand afterwards (admin flag page, or an
-- UPDATE on system_settings).
--
-- Run it by hand in the Supabase SQL editor. Safe to re-run: a key that is already present keeps
-- its current value.
--
-- Only useful together with a code rollback. The current code no longer knows these keys, and
-- neither flag was ever read at runtime, so restoring them changes no behaviour on its own.

SET search_path = public, pg_temp;

-- 1. The live store. Keys already in the object win over the restored defaults. If the
--    feature_flags row does not exist, nothing is written: no row means "all defaults", and the
--    old default for both keys was true.
UPDATE public.system_settings
SET value = jsonb_build_object(
      'ACHIEVEMENT_EMAIL_ENABLED', true,
      'PORTFOLIO_EMAILS_ENABLED', true
    ) || value,
    updated_at = now()
WHERE key = 'feature_flags'
  AND jsonb_typeof(value) = 'object'
  AND NOT (value ? 'ACHIEVEMENT_EMAIL_ENABLED' AND value ? 'PORTFOLIO_EMAILS_ENABLED');

-- 2. The legacy table (not read by the app).
INSERT INTO public.notification_feature_flags (key, enabled)
VALUES
  ('ACHIEVEMENT_EMAIL_ENABLED', true),
  ('PORTFOLIO_EMAILS_ENABLED', true)
ON CONFLICT (key) DO NOTHING;
