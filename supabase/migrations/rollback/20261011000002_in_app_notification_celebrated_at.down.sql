-- Rollback for Growth R5 / P2. Drops the index and column; the claim must be reverted to the
-- is_read compare-and-set at the same time (app code), or celebrations stop.
DROP INDEX IF EXISTS public.in_app_notifications_uncelebrated_idx;
ALTER TABLE public.in_app_notifications DROP COLUMN IF EXISTS celebrated_at;
