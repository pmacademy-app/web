-- Prodily — B9-D · Retention hold flag and retention indexes
-- Migration: 20260915000001_retention_hold_b9d.sql
-- Addresses: F-REL-6 (tables that grow forever)
--
-- ── NON-DESTRUCTIVE ──────────────────────────────────────────────────────────
--
-- This migration deletes nothing and drops nothing. It adds one boolean column
-- per retained table and the indexes the retention sweep needs. It is safe to
-- apply ahead of enabling deletion, and it must be: the cron route that consumes
-- these columns ships with deletion DISABLED, and `/api/cron/cleanup` reports
-- what it *would* remove until a human sets `RETENTION_DELETE_ENABLED=true`.
--
-- ── The hold flag ────────────────────────────────────────────────────────────
--
-- L-11 (docs/FINAL_IMPLEMENTATION_PLAN.md) fixes the retention windows and then
-- says: "Active legal/incident holds override automatic deletion." `retention_hold`
-- is that override, per record. A row with the flag set is never eligible, at any
-- age, for any reason — an incident still under investigation, a record subject to
-- a legal hold, a support case someone is still reading.
--
-- It defaults to false so existing rows keep their current (unheld) meaning, and it
-- is NOT NULL so the sweep's predicate cannot be defeated by a null.
--
-- `admin_audit_logs` deliberately has no column here. It is out of scope for
-- deletion entirely — a security review needs it, and a table that is never swept
-- does not need a way to be exempted from the sweep.
--
-- `system_settings` also has no column. Its rows are configuration, not telemetry;
-- only the dated `email_sent_count_YYYY_MM_DD` counters are swept, and those are
-- matched by key rather than by age.
--
-- ── Indexes ──────────────────────────────────────────────────────────────────
--
-- Each sweep reads `WHERE <timestamp> < cutoff AND retention_hold = false`. The
-- indexes below are partial on `retention_hold = false`, which is the overwhelming
-- majority of rows, so they stay small and serve the sweep directly instead of
-- forcing a sequential scan on tables that exist because they are large.
--
-- Idempotent throughout (`IF NOT EXISTS`), per repository convention.

-- ── 1. Hold flags ────────────────────────────────────────────────────────────

ALTER TABLE public.system_errors
  ADD COLUMN IF NOT EXISTS retention_hold boolean NOT NULL DEFAULT false;

ALTER TABLE public.email_queue
  ADD COLUMN IF NOT EXISTS retention_hold boolean NOT NULL DEFAULT false;

ALTER TABLE public.email_delivery_events
  ADD COLUMN IF NOT EXISTS retention_hold boolean NOT NULL DEFAULT false;

ALTER TABLE public.notification_events
  ADD COLUMN IF NOT EXISTS retention_hold boolean NOT NULL DEFAULT false;

ALTER TABLE public.user_notification_timeline
  ADD COLUMN IF NOT EXISTS retention_hold boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.system_errors.retention_hold IS
  'B9-D: when true this incident is exempt from automatic retention deletion at any age (legal or incident hold).';
COMMENT ON COLUMN public.email_queue.retention_hold IS
  'B9-D: when true this queue record is exempt from automatic retention deletion at any age.';
COMMENT ON COLUMN public.email_delivery_events.retention_hold IS
  'B9-D: when true this delivery event is exempt from automatic retention deletion at any age.';
COMMENT ON COLUMN public.notification_events.retention_hold IS
  'B9-D: when true this telemetry row is exempt from automatic retention deletion at any age.';
COMMENT ON COLUMN public.user_notification_timeline.retention_hold IS
  'B9-D: when true this timeline row is exempt from automatic retention deletion at any age.';

-- ── 2. Retention sweep indexes ───────────────────────────────────────────────
--
-- `system_errors` is swept on `timestamp`, and on two different windows: security
-- and auth incidents are kept 180 days, everything else 90 (L-11). `category` is
-- part of the index so the two sweeps do not each scan the other's rows.
CREATE INDEX IF NOT EXISTS idx_system_errors_retention
  ON public.system_errors (timestamp, category)
  WHERE retention_hold = false;

-- The queue is swept on `updated_at` — the last time the row was touched, which is
-- when it reached its terminal state. `status` is in the index because completed
-- records (30 days) and dead letters (90 days) are separate sweeps.
CREATE INDEX IF NOT EXISTS idx_email_queue_retention
  ON public.email_queue (status, updated_at)
  WHERE retention_hold = false;

CREATE INDEX IF NOT EXISTS idx_email_delivery_events_retention
  ON public.email_delivery_events (occurred_at)
  WHERE retention_hold = false;

CREATE INDEX IF NOT EXISTS idx_notification_events_retention
  ON public.notification_events (created_at)
  WHERE retention_hold = false;

CREATE INDEX IF NOT EXISTS idx_user_notification_timeline_retention
  ON public.user_notification_timeline (created_at)
  WHERE retention_hold = false;

-- `rate_limits` has no hold column: a rate-limit bucket is not something anyone
-- places a legal hold on, and its rows are dead within minutes of their window.
-- The existing index leads with `key`, which does not serve a range scan on age.
CREATE INDEX IF NOT EXISTS idx_rate_limits_last_requested
  ON public.rate_limits (last_requested_at);
