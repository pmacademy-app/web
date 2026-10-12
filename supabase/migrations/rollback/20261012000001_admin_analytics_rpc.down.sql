-- Rollback: 20261012000001_admin_analytics_rpc.sql
-- Roll back the app code first: once these are gone, the analytics page shows
-- zeroed sections with `failed` set until the old code is redeployed.

DROP FUNCTION IF EXISTS public.admin_active_users(timestamptz, timestamptz);
DROP FUNCTION IF EXISTS public.admin_lesson_completion_stats(jsonb);
DROP FUNCTION IF EXISTS public.admin_capstone_stats(timestamptz, timestamptz);
DROP FUNCTION IF EXISTS public.admin_flashcard_stats();
DROP FUNCTION IF EXISTS public.admin_user_stats();
