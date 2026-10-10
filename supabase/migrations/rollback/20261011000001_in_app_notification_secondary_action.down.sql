-- Rollback for Growth R5 / B0. Drops the optional second-action column; no other data is touched.
ALTER TABLE public.in_app_notifications DROP COLUMN IF EXISTS secondary_action;
