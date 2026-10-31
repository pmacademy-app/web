-- Rollback for 20261027000001: users.username format CHECK.
--
-- Drops the constraint. Run it in the Supabase SQL editor. Safe to re-run. No data is changed.
--
-- The app keeps refusing bad handles without it (onboarding and Settings > Portfolio both call
-- validateUsername in apps/web/lib/portfolio.ts); only writers outside the app lose the guard.
-- Use this if a write path the CHECK blocks has to be unblocked fast, for example a learner
-- whose XP or streak updates fail with 23514 on users_username_format_check.

SET search_path = public, pg_temp;

ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_username_format_check;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.users'::regclass
      AND conname = 'users_username_format_check'
  ) THEN
    RAISE EXCEPTION 'users_username_format_check is still present on public.users.';
  END IF;
END $$;
