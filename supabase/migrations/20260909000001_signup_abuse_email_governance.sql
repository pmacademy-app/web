-- Migration: 20260909000001_signup_abuse_email_governance.sql
-- Incident: 2026-09-09 signup abuse + Brevo credit exhaustion (second occurrence).
--
-- The 2026-09-06 response rate-limited /api/auth/signup and gated the queue on a
-- daily quota. Neither control covered the path that actually spent the credits: the
-- Supabase Auth send-email hook calls sendEmail() directly, so every unauthenticated
-- auth.signUp() / auth.resend() produced an outbound provider call that no quota,
-- kill switch, suppression or dedup ever saw. This migration adds the durable state
-- those controls need.
--
-- Everything here is additive and idempotent. No historical migration is modified and
-- no existing row is rewritten, so rollback is "stop calling the new functions" --
-- the old code paths continue to work against the unchanged tables.

SET search_path TO public, extensions, auth;

-- ---------------------------------------------------------------------------
-- 1. Governed direct-send ledger
-- ---------------------------------------------------------------------------
-- Direct provider sends (auth verification, password reset, waitlist confirmation)
-- never touched email_queue, so they had no idempotency record anywhere. Without
-- one, a retried hook delivery or a concurrent duplicate request spends credits twice
-- and a failover cannot tell "the primary already accepted this" from "nothing was
-- sent". This ledger is the durable idempotency boundary for those sends.

CREATE TABLE IF NOT EXISTS public.email_send_ledger (
  idempotency_key text PRIMARY KEY,
  purpose         text NOT NULL,
  masked_email    text,
  -- 'claimed' -> a dispatch is in flight; 'sent' -> a provider accepted it;
  -- 'failed'  -> every provider refused, so the key may be re-claimed later.
  status          text NOT NULL DEFAULT 'claimed' CHECK (status IN ('claimed', 'sent', 'failed')),
  provider        text,
  status_code     int,
  attempts        jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_email_send_ledger_created_at
  ON public.email_send_ledger (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_send_ledger_purpose_status
  ON public.email_send_ledger (purpose, status, created_at DESC);

ALTER TABLE public.email_send_ledger ENABLE ROW LEVEL SECURITY;

-- No policy is created deliberately: with RLS enabled and no policy, only the
-- service role (which bypasses RLS) can read or write. This table records who was
-- emailed and when; nothing in the browser has any reason to see it.

COMMENT ON TABLE public.email_send_ledger IS
  'Idempotency and audit ledger for governed direct provider sends (auth mail, waitlist, contact). Service-role only.';

-- Claims an idempotency key for a direct send.
--
-- Returns true only for the caller that actually won the claim. A key already in
-- 'claimed' or 'sent' returns false, so a concurrent duplicate cannot reach a
-- provider. A previously 'failed' key IS re-claimable: a send that no provider
-- accepted must remain retryable, otherwise a transient outage would permanently
-- lock a learner out of verification mail.
CREATE OR REPLACE FUNCTION public.claim_email_send(
  p_key          text,
  p_purpose      text,
  p_masked_email text DEFAULT NULL
)
RETURNS boolean AS $fn$
DECLARE
  claimed_key text;
BEGIN
  INSERT INTO public.email_send_ledger (idempotency_key, purpose, masked_email, status)
  VALUES (p_key, p_purpose, p_masked_email, 'claimed')
  ON CONFLICT (idempotency_key) DO UPDATE
    SET status     = 'claimed',
        updated_at = now()
    WHERE public.email_send_ledger.status = 'failed'
  RETURNING idempotency_key INTO claimed_key;

  RETURN claimed_key IS NOT NULL;
END;
$fn$ LANGUAGE plpgsql SECURITY DEFINER
   SET search_path = public, pg_temp;

-- Records the outcome of a claimed send. Never creates a row: an outcome without a
-- prior claim would mean a send bypassed the gateway.
CREATE OR REPLACE FUNCTION public.finalize_email_send(
  p_key         text,
  p_status      text,
  p_provider    text  DEFAULT NULL,
  p_status_code int   DEFAULT NULL,
  p_attempts    jsonb DEFAULT '[]'::jsonb
)
RETURNS void AS $fn$
BEGIN
  IF p_status NOT IN ('sent', 'failed') THEN
    RAISE EXCEPTION 'finalize_email_send: invalid status %', p_status;
  END IF;

  UPDATE public.email_send_ledger
     SET status      = p_status,
         provider    = COALESCE(p_provider, provider),
         status_code = COALESCE(p_status_code, status_code),
         attempts    = COALESCE(p_attempts, attempts),
         updated_at  = now()
   WHERE idempotency_key = p_key;
END;
$fn$ LANGUAGE plpgsql SECURITY DEFINER
   SET search_path = public, pg_temp;

-- ---------------------------------------------------------------------------
-- 2. Welcome-email deduplication enforced by the database
-- ---------------------------------------------------------------------------
-- enqueueNotificationItem deduplicated with SELECT-then-INSERT and .maybeSingle().
-- Two concurrent signups both see "no existing row" and both insert; and once two
-- rows exist .maybeSingle() errors, the error is discarded, and every later attempt
-- inserts another duplicate. Uniqueness has to be the database's job.

ALTER TABLE public.email_queue
  ADD COLUMN IF NOT EXISTS idempotency_key text;

-- Backfill a key for existing rows so the unique index below can be created without
-- collapsing history: legacy rows get a per-row unique key derived from their id.
UPDATE public.email_queue
   SET idempotency_key = 'legacy:' || id::text
 WHERE idempotency_key IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_email_queue_idempotency_key
  ON public.email_queue (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

COMMENT ON COLUMN public.email_queue.idempotency_key IS
  'Caller-supplied logical identity of this message (e.g. welcome:<user_id>). Unique -- the database, not a prior SELECT, prevents duplicates.';

-- ---------------------------------------------------------------------------
-- 3. Atomic, fail-closed rate limiting
-- ---------------------------------------------------------------------------
-- evaluatePersistentRateLimit() did SELECT then UPDATE as two statements, so N
-- concurrent requests all read the same count and all passed. This does the whole
-- decision in one statement under the row lock taken by the upsert.

CREATE OR REPLACE FUNCTION public.consume_rate_limit(
  p_key       text,
  p_limit     int,
  p_window_ms bigint
)
RETURNS TABLE (allowed boolean, remaining int, reset_in_ms bigint) AS $fn$
DECLARE
  v_window interval := make_interval(secs => p_window_ms / 1000.0);
  v_count  int;
  v_last   timestamptz;
BEGIN
  -- One statement: insert a fresh window, or increment the live one. The WHERE on
  -- the DO UPDATE means an exhausted window updates no row, which is how we detect
  -- "over the limit" without a separate read.
  INSERT INTO public.rate_limits (key, last_requested_at, count, updated_at)
  VALUES (p_key, now(), 1, now())
  ON CONFLICT (key) DO UPDATE
    SET count = CASE
                  WHEN public.rate_limits.last_requested_at < now() - v_window THEN 1
                  ELSE public.rate_limits.count + 1
                END,
        last_requested_at = CASE
                  WHEN public.rate_limits.last_requested_at < now() - v_window THEN now()
                  ELSE public.rate_limits.last_requested_at
                END,
        updated_at = now()
    WHERE public.rate_limits.last_requested_at < now() - v_window
       OR public.rate_limits.count < p_limit
  RETURNING public.rate_limits.count, public.rate_limits.last_requested_at
       INTO v_count, v_last;

  IF v_count IS NULL THEN
    -- The upsert matched nothing: the window is live and already at the limit.
    SELECT rl.count, rl.last_requested_at
      INTO v_count, v_last
      FROM public.rate_limits rl
     WHERE rl.key = p_key;

    RETURN QUERY SELECT
      false,
      0,
      GREATEST(0, p_window_ms - (EXTRACT(EPOCH FROM (now() - COALESCE(v_last, now()))) * 1000)::bigint);
    RETURN;
  END IF;

  RETURN QUERY SELECT
    true,
    GREATEST(0, p_limit - v_count),
    GREATEST(0, p_window_ms - (EXTRACT(EPOCH FROM (now() - v_last)) * 1000)::bigint);
END;
$fn$ LANGUAGE plpgsql SECURITY DEFINER
   SET search_path = public, pg_temp;

COMMENT ON FUNCTION public.consume_rate_limit(text, int, bigint) IS
  'Atomically increments and checks a sliding-window counter. Replaces the non-atomic SELECT-then-UPDATE in lib/rate-limit.ts.';

-- ---------------------------------------------------------------------------
-- 4. Per-provider daily send quota
-- ---------------------------------------------------------------------------
-- increment_daily_email_quota is a single global counter. It cannot express "Brevo
-- is spent, Resend is not", so once the global limit was reached the platform stopped
-- sending entirely even though the failover provider was healthy -- and before that,
-- it happily kept selecting the exhausted Brevo. Failover needs per-provider state.

CREATE TABLE IF NOT EXISTS public.email_provider_quota (
  provider     text NOT NULL,
  quota_day    date NOT NULL,
  sent_count   int NOT NULL DEFAULT 0,
  -- Set when a provider reports capacity exhaustion (402/429/not_enough_credits).
  -- Lets dispatch skip a provider we already know is spent for the rest of the day.
  exhausted_at timestamptz,
  updated_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (provider, quota_day)
);

ALTER TABLE public.email_provider_quota ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.email_provider_quota IS
  'Per-provider, per-UTC-day send accounting and exhaustion marker. Service-role only.';

-- Reserves one send against a provider's daily allowance.
--
-- Reservation happens BEFORE dispatch and is released by release_provider_email_quota
-- when the send never actually reached the provider -- the 2026-09-06 bug was the
-- mirror image of this (increment after send, return value discarded), which tracked
-- spend without ever capping it.
CREATE OR REPLACE FUNCTION public.reserve_provider_email_quota(
  p_provider text,
  p_limit    int
)
RETURNS boolean AS $fn$
DECLARE
  v_day   date := (now() AT TIME ZONE 'UTC')::date;
  v_count int;
BEGIN
  -- A provider already flagged exhausted today is not reservable at any limit.
  IF EXISTS (
    SELECT 1 FROM public.email_provider_quota
     WHERE provider = p_provider AND quota_day = v_day AND exhausted_at IS NOT NULL
  ) THEN
    RETURN false;
  END IF;

  INSERT INTO public.email_provider_quota (provider, quota_day, sent_count, updated_at)
  VALUES (p_provider, v_day, 1, now())
  ON CONFLICT (provider, quota_day) DO UPDATE
    SET sent_count = public.email_provider_quota.sent_count + 1,
        updated_at = now()
    WHERE public.email_provider_quota.sent_count < p_limit
  RETURNING sent_count INTO v_count;

  RETURN v_count IS NOT NULL;
END;
$fn$ LANGUAGE plpgsql SECURITY DEFINER
   SET search_path = public, pg_temp;

-- Gives a reservation back when the send did not happen (kill switch tripped after
-- reservation, template render failure, provider skipped). Never drops below zero.
CREATE OR REPLACE FUNCTION public.release_provider_email_quota(p_provider text)
RETURNS void AS $fn$
DECLARE
  v_day date := (now() AT TIME ZONE 'UTC')::date;
BEGIN
  UPDATE public.email_provider_quota
     SET sent_count = GREATEST(0, sent_count - 1),
         updated_at = now()
   WHERE provider = p_provider AND quota_day = v_day;
END;
$fn$ LANGUAGE plpgsql SECURITY DEFINER
   SET search_path = public, pg_temp;

-- Marks a provider spent for the rest of the UTC day so dispatch stops selecting it.
-- This is what stops "retry the exhausted provider forever": once Brevo answers
-- 402 / not_enough_credits, every subsequent send goes straight to Resend.
CREATE OR REPLACE FUNCTION public.mark_provider_exhausted(p_provider text)
RETURNS void AS $fn$
DECLARE
  v_day date := (now() AT TIME ZONE 'UTC')::date;
BEGIN
  INSERT INTO public.email_provider_quota (provider, quota_day, sent_count, exhausted_at, updated_at)
  VALUES (p_provider, v_day, 0, now(), now())
  ON CONFLICT (provider, quota_day) DO UPDATE
    SET exhausted_at = COALESCE(public.email_provider_quota.exhausted_at, now()),
        updated_at   = now();
END;
$fn$ LANGUAGE plpgsql SECURITY DEFINER
   SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION public.is_provider_exhausted(p_provider text)
RETURNS boolean AS $fn$
  SELECT EXISTS (
    SELECT 1 FROM public.email_provider_quota
     WHERE provider = p_provider
       AND quota_day = (now() AT TIME ZONE 'UTC')::date
       AND exhausted_at IS NOT NULL
  );
$fn$ LANGUAGE sql SECURITY DEFINER STABLE
   SET search_path = public, pg_temp;

-- ---------------------------------------------------------------------------
-- 5. Grants
-- ---------------------------------------------------------------------------
-- These are service-role operations only. Revoke the default PUBLIC EXECUTE that
-- SECURITY DEFINER functions would otherwise carry -- an anon caller must not be able
-- to burn quota reservations or mark a provider exhausted.
REVOKE ALL ON FUNCTION public.claim_email_send(text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.finalize_email_send(text, text, text, int, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.consume_rate_limit(text, int, bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reserve_provider_email_quota(text, int) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.release_provider_email_quota(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mark_provider_exhausted(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_provider_exhausted(text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.claim_email_send(text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.finalize_email_send(text, text, text, int, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.consume_rate_limit(text, int, bigint) TO service_role;
GRANT EXECUTE ON FUNCTION public.reserve_provider_email_quota(text, int) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_provider_email_quota(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.mark_provider_exhausted(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.is_provider_exhausted(text) TO service_role;
