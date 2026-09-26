-- Migration: 20260926000001_phase_t5_operational_resilience.sql
-- Phase T5: Operational Resilience & Observability

-- 1. Webhook Event Idempotency: Add provider_event_id column and unique constraint to email_delivery_events
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'email_delivery_events'
      AND column_name = 'provider_event_id'
  ) THEN
    ALTER TABLE public.email_delivery_events ADD COLUMN provider_event_id text;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_email_delivery_events_provider_event_id
  ON public.email_delivery_events (provider_event_id)
  WHERE provider_event_id IS NOT NULL;

-- 2. Index for quick email suppression checks
CREATE INDEX IF NOT EXISTS idx_email_suppressions_email_reason
  ON public.email_suppressions (email, reason);
