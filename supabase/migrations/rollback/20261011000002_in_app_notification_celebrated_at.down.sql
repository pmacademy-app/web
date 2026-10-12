-- Rollback for Growth R5 / P2. Drops the index and column; the claim must be reverted to the
-- is_read compare-and-set at the same time (app code), or celebrations stop.
--
-- Revert the app to the previous release first. The R5 code selects celebrated_at in the
-- celebration claim and writes it; with the column gone those queries fail.

-- Rows retired by the newest-Fellow rule (and any other row the R5 code stamped) are celebrated
-- without being read. The rolled-back code claims on is_read, so it would celebrate every unread
-- row again. Mark them read before the column that records the celebration is dropped.
-- Guarded so the file can be re-run after the column is gone.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'in_app_notifications'
      AND column_name = 'celebrated_at'
  ) THEN
    UPDATE public.in_app_notifications
    SET is_read = true, read_at = coalesce(read_at, celebrated_at)
    WHERE celebrated_at IS NOT NULL AND is_read = false;
  END IF;
END $$;

DROP INDEX IF EXISTS public.in_app_notifications_uncelebrated_idx;
ALTER TABLE public.in_app_notifications DROP COLUMN IF EXISTS celebrated_at;
