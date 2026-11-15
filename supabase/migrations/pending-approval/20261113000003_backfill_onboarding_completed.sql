-- AG-13 / SEC-21: Backfill onboarding_completed for legacy users.
--
-- HELD IN pending-approval/. The Supabase CLI does not read this folder, so nothing
-- here runs on merge. The owner applies it by hand in the Supabase SQL editor.
--
-- Why: previously, onboarding completion was read from auth.users.raw_user_meta_data.
-- SEC-21 deprecates user_metadata for access decisions in favor of app_metadata and
-- the public.users database column. This migration sets onboarding_completed = true
-- for users who had completed onboarding according to raw_user_meta_data but lack the
-- database flag.
--
-- Touches only the exact rows:
-- - auth.users.raw_user_meta_data->>'onboarding_complete' = 'true'
-- - public.users.onboarding_completed is not true
-- - public.users.goal is null
-- - public.users.curriculum_access_override is not true
--
-- Safe no-op if count is zero.
--
-- Rollback: rollback/20261113000003_backfill_onboarding_completed.down.sql
-- Validation: validation/20261113000003_backfill_onboarding_completed_validation.sql

SET search_path = public, pg_temp;

UPDATE public.users pu
SET onboarding_completed = true,
    updated_at = now()
FROM auth.users au
WHERE pu.id = au.id
  AND au.raw_user_meta_data->>'onboarding_complete' = 'true'
  AND (pu.onboarding_completed IS NOT TRUE)
  AND (pu.goal IS NULL)
  AND (pu.curriculum_access_override IS NOT TRUE);
