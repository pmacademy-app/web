-- Rollback: 20261113000008_drop_duplicate_indexes.down.sql
-- Re-creates any indexes dropped by 20261113000008_drop_duplicate_indexes.sql

CREATE INDEX IF NOT EXISTS idx_email_queue_user_id ON public.email_queue (user_id);
