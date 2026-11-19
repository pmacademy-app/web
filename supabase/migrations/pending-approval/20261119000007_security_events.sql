-- Security event counters and daily digests, for the rule-based (no AI) daily security summary.
--
-- HELD IN pending-approval/. The Supabase CLI does not read this folder, so nothing here runs on
-- merge. The owner applies it by hand in the Supabase SQL editor.
--
-- Why: failed logins, rate-limit refusals, rejected Turnstile tokens, rejected webhook and hook
-- signatures, wrong cron bearers and cross-origin writes are only visible today as scattered log
-- lines. The learner app now counts them (apps/web/lib/security/security-events.ts) and the admin
-- console (separate repository) reads the counts to build one daily summary. The column names,
-- the event type list and the function signature below are a fixed contract with that console.
--
-- This migration:
--   1. Creates public.security_event_counts: one row per (IST calendar day, event type, app,
--      ip bucket, subject hash) with a running count. No raw IP and no full email is stored:
--      ip_bucket is a network prefix, subject_hash is the first 16 hex characters of a sha256 and
--      subject_hint is a masked address such as j***@gmail.com.
--   2. Creates public.record_security_event(...), SECURITY DEFINER with a fixed search_path, which
--      upserts one count. Flood guard: once a day already holds 50000 rows, a new key is dropped
--      (existing keys still count), so a spray of random subjects cannot grow the table without
--      bound on the 500 MB free tier.
--   3. Creates public.security_digests: one rule-based summary row per day, written by the admin
--      console.
--   4. Enables RLS on both tables with no policy, revokes everything from PUBLIC, anon and
--      authenticated, and grants only service_role. Nothing here grants anything to anon or
--      authenticated.
--
-- Retention (apps/web/lib/retention/policy.ts): security_event_counts 30 days, security_digests
-- 365 days, swept by /api/cron/cleanup.
--
-- Idempotent: CREATE ... IF NOT EXISTS, CREATE OR REPLACE, REVOKE, GRANT and the self-check can all
-- be re-run. No existing data is changed.
-- Rollback: rollback/20261119000007_security_events.down.sql (next to this file).
-- Validation: validation/20261119000007_security_events_validation.sql.

SET search_path = public, pg_temp;

-- ---------------------------------------------------------------------------
-- 1. public.security_event_counts
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.security_event_counts (
  day date NOT NULL,
  event_type text NOT NULL,
  app text NOT NULL,
  ip_bucket text NOT NULL DEFAULT '',
  subject_hash text NOT NULL DEFAULT '',
  subject_hint text NULL,
  sample_path text NULL,
  count integer NOT NULL DEFAULT 0,
  first_seen timestamptz NOT NULL DEFAULT now(),
  last_seen timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT security_event_counts_event_type_check CHECK (event_type IN (
    'login_failed',
    'login_rate_limited',
    'admin_login_failed',
    'admin_login_rate_limited',
    'admin_login_non_admin',
    'signup_blocked',
    'turnstile_failed',
    'password_reset_requested',
    'password_reset_rate_limited',
    'origin_rejected',
    'webhook_auth_failed',
    'email_hook_auth_failed',
    'cron_auth_failed',
    'internal_revalidate_auth_failed',
    'client_errors_flood',
    'quiz_check_rate_limited'
  )),
  CONSTRAINT security_event_counts_app_check CHECK (app IN ('web', 'admin')),
  CONSTRAINT security_event_counts_lengths_check CHECK (
    char_length(ip_bucket) <= 64
    AND char_length(subject_hash) <= 32
    AND (subject_hint IS NULL OR char_length(subject_hint) <= 120)
    AND (sample_path IS NULL OR char_length(sample_path) <= 200)
  ),
  CONSTRAINT security_event_counts_count_check CHECK (count >= 0),
  CONSTRAINT security_event_counts_key UNIQUE (day, event_type, app, ip_bucket, subject_hash)
);

COMMENT ON TABLE public.security_event_counts IS
  'Daily security event counters (IST day). Written only through record_security_event by the service role; read by the admin console daily digest. No raw IPs or full emails.';

-- The unique key already leads with (day, event_type); this index is part of the contract with the
-- admin console and keeps its per-day, per-type reads independent of the key's column order.
CREATE INDEX IF NOT EXISTS security_event_counts_day_event_type_idx
  ON public.security_event_counts (day, event_type);

ALTER TABLE public.security_event_counts ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.security_event_counts FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.security_event_counts TO service_role;

-- ---------------------------------------------------------------------------
-- 2. public.record_security_event
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.record_security_event(
  p_event_type text,
  p_app text,
  p_ip_bucket text,
  p_subject_hash text,
  p_subject_hint text,
  p_path text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  -- Calendar day in India Standard Time, the day the owner reads the digest for.
  v_day date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  v_ip text := left(btrim(coalesce(p_ip_bucket, '')), 64);
  v_subject text := left(lower(btrim(coalesce(p_subject_hash, ''))), 32);
  v_hint text := nullif(left(btrim(coalesce(p_subject_hint, '')), 120), '');
  -- Path only: anything after ? or # (tokens, emails in a query) is dropped.
  v_path text := nullif(left(split_part(split_part(btrim(coalesce(p_path, '')), '?', 1), '#', 1), 200), '');
  v_rows bigint;
BEGIN
  IF p_event_type IS NULL OR p_app IS NULL THEN
    RAISE EXCEPTION 'record_security_event: event type and app are required' USING ERRCODE = '22023';
  END IF;

  -- Existing key: always counts, even past the flood guard.
  UPDATE public.security_event_counts
     SET count = count + 1,
         last_seen = now(),
         sample_path = coalesce(sample_path, v_path)
   WHERE day = v_day
     AND event_type = p_event_type
     AND app = p_app
     AND ip_bucket = v_ip
     AND subject_hash = v_subject;

  IF FOUND THEN
    RETURN;
  END IF;

  -- Flood guard: a new key is dropped once the day already holds 50000 rows. The LIMIT keeps the
  -- count bounded however large the day grows.
  SELECT count(*) INTO v_rows
    FROM (
      SELECT 1 FROM public.security_event_counts WHERE day = v_day LIMIT 50000
    ) AS day_rows;

  IF v_rows >= 50000 THEN
    RETURN;
  END IF;

  -- ON CONFLICT covers two first events for the same key racing past the UPDATE above.
  INSERT INTO public.security_event_counts AS c
    (day, event_type, app, ip_bucket, subject_hash, subject_hint, sample_path, count, first_seen, last_seen)
  VALUES
    (v_day, p_event_type, p_app, v_ip, v_subject, v_hint, v_path, 1, now(), now())
  ON CONFLICT (day, event_type, app, ip_bucket, subject_hash) DO UPDATE
    SET count = c.count + 1,
        last_seen = now(),
        sample_path = coalesce(c.sample_path, EXCLUDED.sample_path);
END;
$$;

COMMENT ON FUNCTION public.record_security_event(text, text, text, text, text, text) IS
  'Counts one security event for the current IST day. Service role only. Unknown event types fail the table CHECK.';

REVOKE ALL ON FUNCTION public.record_security_event(text, text, text, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_security_event(text, text, text, text, text, text) TO service_role;

-- ---------------------------------------------------------------------------
-- 3. public.security_digests
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.security_digests (
  day date PRIMARY KEY,
  generated_at timestamptz NOT NULL DEFAULT now(),
  severity text NOT NULL,
  summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  findings jsonb NOT NULL DEFAULT '[]'::jsonb,
  CONSTRAINT security_digests_severity_check CHECK (severity IN ('none', 'low', 'medium', 'high'))
);

COMMENT ON TABLE public.security_digests IS
  'One rule-based security summary per IST day, written by the admin console with the service role.';

ALTER TABLE public.security_digests ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.security_digests FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.security_digests TO service_role;

-- ---------------------------------------------------------------------------
-- Self-check
-- ---------------------------------------------------------------------------
-- REVOKE says nothing when a grant made by another role stays in place, and a column-level grant
-- made by a different grantor survives a table-level REVOKE. Check the result instead.
DO $$
DECLARE
  v_role text;
  v_table text;
  v_fn constant text := 'public.record_security_event(text, text, text, text, text, text)';
  v_secdef boolean;
  v_config text[];
BEGIN
  FOREACH v_table IN ARRAY ARRAY['public.security_event_counts', 'public.security_digests'] LOOP
    IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = v_table::regclass) THEN
      RAISE EXCEPTION 'Row level security is off on %.', v_table;
    END IF;

    IF EXISTS (
      SELECT 1 FROM pg_policies
       WHERE schemaname = 'public'
         AND tablename = split_part(v_table, '.', 2)
    ) THEN
      RAISE EXCEPTION 'A policy exists on %. These tables are service-role only.', v_table;
    END IF;

    -- 'public' is the PUBLIC pseudo-role in the privilege inquiry functions.
    FOREACH v_role IN ARRAY ARRAY['public', 'anon', 'authenticated'] LOOP
      IF has_table_privilege(v_role, v_table, 'SELECT, INSERT, UPDATE, DELETE')
         OR has_any_column_privilege(v_role, v_table, 'SELECT, INSERT, UPDATE') THEN
        RAISE EXCEPTION '% still has a privilege on %. Look up the grantor in information_schema.role_table_grants and column_privileges, run REVOKE as that role, then apply this migration again.', v_role, v_table;
      END IF;
    END LOOP;

    IF NOT (
      has_table_privilege('service_role', v_table, 'SELECT')
      AND has_table_privilege('service_role', v_table, 'INSERT')
      AND has_table_privilege('service_role', v_table, 'UPDATE')
      AND has_table_privilege('service_role', v_table, 'DELETE')
    ) THEN
      RAISE EXCEPTION 'service_role cannot read and write %. The app and the admin console need it.', v_table;
    END IF;
  END LOOP;

  FOREACH v_role IN ARRAY ARRAY['public', 'anon', 'authenticated'] LOOP
    IF has_function_privilege(v_role, v_fn, 'EXECUTE') THEN
      RAISE EXCEPTION '% can still execute %. Revoke it as the grantor, then apply this migration again.', v_role, v_fn;
    END IF;
  END LOOP;

  IF NOT has_function_privilege('service_role', v_fn, 'EXECUTE') THEN
    RAISE EXCEPTION 'service_role cannot execute %.', v_fn;
  END IF;

  SELECT prosecdef, proconfig INTO v_secdef, v_config
    FROM pg_proc
   WHERE oid = v_fn::regprocedure;

  IF NOT v_secdef THEN
    RAISE EXCEPTION '% is not SECURITY DEFINER.', v_fn;
  END IF;

  IF v_config IS NULL OR NOT ('search_path=public, pg_temp' = ANY (v_config)) THEN
    RAISE EXCEPTION '% does not pin search_path to public, pg_temp.', v_fn;
  END IF;
END $$;
