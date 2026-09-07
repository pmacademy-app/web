-- Migration: 20260908000001_error_taxonomy.sql
-- Adds the structured error taxonomy columns to public.system_errors and widens the
-- category CHECK so provider and domain values can actually be written.
--
-- The existing CHECK allowed ('auth','verification','queue','resend','webhook','cron',
-- 'system') but lib/monitoring/logger.ts has been emitting category 'brevo' since the
-- Brevo provider was added. Every Brevo failure therefore violated the constraint and
-- the insert was swallowed by the logger's warn-and-continue path — Brevo failures
-- produced ZERO rows in system_errors while appearing to be instrumented.

SET search_path TO public, extensions, auth;

-- 1. Taxonomy columns. All nullable: rows written through the legacy
--    logSystemError() signature carry no domain/kind and must remain valid.
ALTER TABLE public.system_errors
  ADD COLUMN IF NOT EXISTS domain text,
  ADD COLUMN IF NOT EXISTS kind text,
  ADD COLUMN IF NOT EXISTS retryability text,
  ADD COLUMN IF NOT EXISTS next_action text,
  ADD COLUMN IF NOT EXISTS occurrence_count integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS first_seen_at timestamptz;

-- 2. Widen the category CHECK to cover every provider and domain value in use.
ALTER TABLE public.system_errors
  DROP CONSTRAINT IF EXISTS system_errors_category_check;

ALTER TABLE public.system_errors
  ADD CONSTRAINT system_errors_category_check CHECK (
    category IN (
      -- pre-existing values, preserved
      'auth', 'verification', 'queue', 'resend', 'webhook', 'cron', 'system',
      -- provider that was already being written but rejected by the old constraint
      'brevo',
      -- taxonomy domains
      'email', 'admin', 'db', 'api', 'config'
    )
  );

-- 3. Constrain the taxonomy columns to their documented value sets.
ALTER TABLE public.system_errors
  DROP CONSTRAINT IF EXISTS system_errors_domain_check;
ALTER TABLE public.system_errors
  ADD CONSTRAINT system_errors_domain_check CHECK (
    domain IS NULL OR domain IN ('email', 'auth', 'queue', 'admin', 'db', 'webhook', 'cron', 'api')
  );

ALTER TABLE public.system_errors
  DROP CONSTRAINT IF EXISTS system_errors_kind_check;
ALTER TABLE public.system_errors
  ADD CONSTRAINT system_errors_kind_check CHECK (
    kind IS NULL OR kind IN (
      'provider_quota', 'provider_outage', 'provider_timeout', 'provider_rejected',
      'config_missing', 'auth_failed', 'db_unavailable', 'validation', 'unexpected'
    )
  );

ALTER TABLE public.system_errors
  DROP CONSTRAINT IF EXISTS system_errors_retryability_check;
ALTER TABLE public.system_errors
  ADD CONSTRAINT system_errors_retryability_check CHECK (
    retryability IS NULL OR retryability IN ('auto_retrying', 'manual_retry', 'terminal')
  );

-- 4. Backfill first_seen_at for existing rows so the column is never ambiguous.
UPDATE public.system_errors
SET first_seen_at = timestamp
WHERE first_seen_at IS NULL;

-- 5. Supports the dedup lookup (fingerprint + recent window, newest first) and the
--    admin console's kind/domain facets.
CREATE INDEX IF NOT EXISTS idx_system_errors_kind_timestamp
  ON public.system_errors (kind, timestamp DESC);

COMMENT ON COLUMN public.system_errors.domain IS 'Subsystem the failure belongs to (see lib/monitoring/error-taxonomy.ts).';
COMMENT ON COLUMN public.system_errors.kind IS 'Failure kind; severity is derived from this, never assigned by hand.';
COMMENT ON COLUMN public.system_errors.retryability IS 'Whether the system recovers on its own: auto_retrying | manual_retry | terminal.';
COMMENT ON COLUMN public.system_errors.next_action IS 'Operator guidance rendered as the alert primary line.';
COMMENT ON COLUMN public.system_errors.occurrence_count IS 'Repeats collapsed into this incident inside the dedup window.';
