-- 20260823000001_notification_idempotency_and_avatar_cleanup.sql
-- Add idempotency_key to in_app_notifications to guarantee exactly-once delivery

ALTER TABLE public.in_app_notifications
ADD COLUMN IF NOT EXISTS idempotency_key TEXT;

-- Create partial unique index on (user_id, idempotency_key)
CREATE UNIQUE INDEX IF NOT EXISTS idx_in_app_notifications_user_idempotency
ON public.in_app_notifications (user_id, idempotency_key)
WHERE idempotency_key IS NOT NULL;

-- Index for speedy lookups by idempotency_key
CREATE INDEX IF NOT EXISTS idx_in_app_notifications_idempotency_key
ON public.in_app_notifications (idempotency_key)
WHERE idempotency_key IS NOT NULL;
