-- Migration: 20260907000001_email_provider_failover.sql
-- Records which provider actually delivered (or refused) each queued email.
--
-- Before failover existed there was exactly one provider per send, so the row's
-- `resend_id` was sufficient. Now a single queue item may be attempted on Brevo and
-- then on Resend, and an operator needs to know which one served it and why the other
-- declined — otherwise "email_queue says delivered" cannot be reconciled against
-- either provider's dashboard.

SET search_path TO public, extensions, auth;

-- Provider that produced the final outcome for this row ('brevo' | 'resend').
ALTER TABLE public.email_queue
ADD COLUMN IF NOT EXISTS provider text;

-- Ordered list of every provider attempt for this row:
--   [{ "provider": "brevo", "success": false, "statusCode": 402, "error": "...", "timestamp": "..." }, ...]
-- At most two entries — the primary and one failover attempt.
ALTER TABLE public.email_queue
ADD COLUMN IF NOT EXISTS provider_attempts jsonb;

COMMENT ON COLUMN public.email_queue.provider IS
  'Email provider that produced the final outcome for this row (brevo | resend).';
COMMENT ON COLUMN public.email_queue.provider_attempts IS
  'Ordered provider attempts for this row, including any failover attempt.';
