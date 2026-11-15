-- Validation for 20261113000003: backfill onboarding_completed (AG-13 / SEC-21).
--
-- Read-only verification query for the owner to check unmigrated user count.
-- Run in the Supabase SQL editor as postgres.
--
-- Expected result after applying the backfill: remaining count is 0.

SELECT count(*) AS remaining_unmigrated_count
FROM auth.users au
LEFT JOIN public.users pu ON pu.id = au.id
WHERE au.raw_user_meta_data->>'onboarding_complete' = 'true'
  AND (pu.onboarding_completed IS NOT TRUE)
  AND (pu.goal IS NULL)
  AND (pu.curriculum_access_override IS NOT TRUE);
