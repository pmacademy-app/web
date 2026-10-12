-- Rollback for Growth R5 / B0. Drops the optional second-action column; no other data is touched.
--
-- Revert the app to the previous release first. The R5 code selects secondary_action in the
-- notifications API and inserts it with every new notification; with the column gone the bell
-- fails to load and notification inserts fail.
ALTER TABLE public.in_app_notifications DROP COLUMN IF EXISTS secondary_action;
