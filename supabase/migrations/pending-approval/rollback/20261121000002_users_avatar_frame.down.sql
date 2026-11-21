-- Rollback for 20261121000002: drop the chosen avatar frame. Learners fall back to the
-- automatic frame (the app treats a missing value as automatic). Re-runnable.

SET search_path = public, pg_temp;

ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_avatar_frame_check;
ALTER TABLE public.users DROP COLUMN IF EXISTS avatar_frame;
