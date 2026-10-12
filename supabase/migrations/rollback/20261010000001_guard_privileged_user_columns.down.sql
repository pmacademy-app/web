-- Rollback for Growth R4 / A0 — privileged user column guard.
--
-- Removes the trigger and its function. No data is touched. Rolling back re-opens the hole
-- described in the forward migration, so only do this to unblock an outage and re-apply after.

DROP TRIGGER IF EXISTS trigger_guard_privileged_user_columns ON public.users;
DROP FUNCTION IF EXISTS public.guard_privileged_user_columns();
