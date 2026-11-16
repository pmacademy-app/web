-- Rollback for 20261113000003: backfill onboarding_completed.
--
-- Note: Reverting a backfill of completed onboarding records is generally not desired
-- unless the migration was run mistakenly. This script sets onboarding_completed back
-- to false for users without a goal or curriculum override whose user_metadata was true.

SET search_path = public, pg_temp;

UPDATE public.users pu
SET onboarding_completed = false,
    updated_at = now()
FROM auth.users au
WHERE pu.id = au.id
  AND au.raw_user_meta_data->>'onboarding_complete' = 'true'
  AND pu.goal IS NULL
  AND (pu.curriculum_access_override IS NOT TRUE);
