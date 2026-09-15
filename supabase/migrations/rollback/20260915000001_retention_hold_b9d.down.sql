-- Rollback for 20260915000001_retention_hold_b9d.sql
--
-- Dropping the hold columns loses which records were held. That is only
-- information about exemptions, not the records themselves — nothing swept is
-- recoverable by this file either way, because the forward migration deletes
-- nothing. Before running this, make sure the retention sweep is disabled
-- (`RETENTION_DELETE_ENABLED` unset), or the next run will consider held records
-- eligible.

DROP INDEX IF EXISTS public.idx_system_errors_retention;
DROP INDEX IF EXISTS public.idx_email_queue_retention;
DROP INDEX IF EXISTS public.idx_email_delivery_events_retention;
DROP INDEX IF EXISTS public.idx_notification_events_retention;
DROP INDEX IF EXISTS public.idx_user_notification_timeline_retention;
DROP INDEX IF EXISTS public.idx_rate_limits_last_requested;

ALTER TABLE public.system_errors DROP COLUMN IF EXISTS retention_hold;
ALTER TABLE public.email_queue DROP COLUMN IF EXISTS retention_hold;
ALTER TABLE public.email_delivery_events DROP COLUMN IF EXISTS retention_hold;
ALTER TABLE public.notification_events DROP COLUMN IF EXISTS retention_hold;
ALTER TABLE public.user_notification_timeline DROP COLUMN IF EXISTS retention_hold;
