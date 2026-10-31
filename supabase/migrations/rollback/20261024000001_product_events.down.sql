-- Rollback for 20261024000001: product_events table and measurement views.
--
-- Drops the two views and the table. This DELETES every recorded product event, so only run it
-- to unblock an outage. lib/events/product-events.ts never throws, so the app keeps working with
-- the table gone (each trackProductEvent call logs a warning instead), and the admin north-star
-- tile shows its load warning. Re-apply the forward migration to resume collection.

SET search_path = public, pg_temp;

DROP VIEW IF EXISTS public.weekly_cohort_retention;
DROP VIEW IF EXISTS public.weekly_mastering_learners;
DROP TABLE IF EXISTS public.product_events;
