-- Phase 2 / PR-11 follow-up (ENG-01, audit W3): an in-database dead-man check for the cron heartbeats.
--
-- HELD IN pending-approval/. The Supabase CLI does not read this folder, so nothing here runs on
-- merge. The owner applies it by hand in the Supabase SQL editor, like 20261024000003, and leaves
-- the file here afterwards.
--
-- Why: the app's stale check (checkStaleHeartbeats in apps/web/lib/monitoring/cron-heartbeat.ts)
-- runs inside the five-minute process-email-queue route. If the scheduler stops, or Vercel is
-- down, that check stops with it and nobody is told. This job reads the same heartbeat rows from
-- inside the database every 15 minutes and posts to a webhook when a job is overdue.
--
-- What it does:
--
-- 1. Enables pg_cron and pg_net (IF NOT EXISTS; both are on the Supabase free tier).
--
-- 2. Adds private.check_cron_heartbeats_deadman(), SECURITY DEFINER with an empty search_path and
--    fully qualified names. For each scheduled job it reads public.system_settings
--    'cron_heartbeat:<job>' (the JSON object recordCronHeartbeat writes: last_success_at,
--    first_run_at, last_run_at as ISO strings) and measures from last_success_at, else
--    first_run_at, else last_run_at, exactly as evaluateHeartbeat does. A job is overdue once that
--    is older than GREATEST(2 x interval, 30) minutes. The intervals below mirror
--    CRON_JOB_DEFINITIONS; eng01-cron-heartbeat.test.ts parses this file and fails if they drift.
--    retry-failed is manual and never checked.
--    A job with no heartbeat row starts a grace period on the first run that sees it
--    (missing_since) and alerts once the same threshold has passed.
--    Alerts are deduplicated per episode through public.system_settings 'cron_deadman_alert:<job>'
--    ({job, episode, alerted_at, missing_since}). The episode is the reference timestamp (or
--    'missing:<missing_since>'), so a job alerts once per outage and again only after it
--    recovers and stalls again. The key is separate from the app's 'cron_heartbeat_alert:<job>' on
--    purpose: the app marks an episode as handled when ALERT_WEBHOOK_URL is not configured, and
--    that must not silence this check. Expect at most two alerts per outage (one per channel).
--
-- 3. Posts the alert with net.http_post to the URL in the Vault secret `cron_alert_webhook_url`
--    (https only; read at run time, never stored in cron.job). The body has the same `text`
--    field and structured fields as buildAlertPayload in out-of-band-alert.ts, so a Slack,
--    Discord or other chat webhook renders it.
--
-- 4. Schedules prodily-deadman-cron-heartbeats every 15 minutes (unschedule-if-exists first).
--
-- 5. A DO $$ self-check that raises (and rolls the whole script back) if the job, the function,
--    its privileges or the Vault secret is missing or wrong.
--
-- Limits, read before relying on it:
--
-- - NOT fully out-of-band when pg_cron is also the job scheduler (20261024000003 applied). If
--   pg_cron itself stops, or the database is down, this check stops too and stays silent. It does
--   cover the common failures: Vercel down, a route failing every run, CRON_SECRET or site_url
--   wrong, GitHub Actions schedules dropped. A fully independent check needs a second provider
--   (for example a free external uptime monitor on a heartbeat endpoint); not done here (D7).
-- - The webhook URL briefly sits in net.http_request_queue (the pg_net request queue, until the
--   worker sends it) and the response lands in net._http_response. Neither is reachable through
--   PostgREST when `net` is not an exposed schema and anon/authenticated have no privileges on
--   it; the 20261024000003 validation file checks both. Use a webhook URL whose only power is
--   posting to one alert channel.
-- - pg_net is fire-and-forget: the episode is marked as alerted once the request is queued. A
--   webhook that rejects the request is not retried; check net._http_response (validation query 3).
-- - If the function itself fails (for example the Vault secret was deleted), the failure shows
--   only in cron.job_run_details.
--
-- Prerequisite: the Vault secret `cron_alert_webhook_url` (an https webhook URL, for example the
-- same value as ALERT_WEBHOOK_URL in Vercel) must exist before this runs. The self-check refuses
-- to finish without it.
--
-- Idempotent: CREATE EXTENSION IF NOT EXISTS, CREATE SCHEMA IF NOT EXISTS, CREATE OR REPLACE
-- FUNCTION, REVOKE, and an unschedule-if-exists guard before the job is scheduled.
-- Rollback: pending-approval/rollback/20261030000001_cron_heartbeat_deadman.down.sql.
-- Validation: pending-approval/validation/20261030000001_cron_heartbeat_deadman_validation.sql.

-- ---------------------------------------------------------------------------
-- 1. Extensions
-- ---------------------------------------------------------------------------

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- ---------------------------------------------------------------------------
-- 2. The check
-- ---------------------------------------------------------------------------

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.check_cron_heartbeats_deadman()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
  v_now           timestamptz := pg_catalog.now();
  v_url           text;
  v_job           record;
  v_beat          jsonb;
  v_marker        jsonb;
  v_marker_key    text;
  v_reference     text;
  v_ref_ts        timestamptz;
  v_threshold     integer;
  v_episode       text;
  v_missing_since text;
  v_minutes       integer;
  v_message       text;
  v_next_action   text := 'Check the scheduler (pg_cron cron.job_run_details, or the notification-scheduler GitHub Actions workflow) and the route logs on Vercel.';
  v_sent          integer := 0;
BEGIN
  SELECT ds.decrypted_secret INTO v_url
  FROM vault.decrypted_secrets ds
  WHERE ds.name = 'cron_alert_webhook_url'
  ORDER BY ds.created_at DESC
  LIMIT 1;

  -- Never echo the URL in an error: these messages land in cron.job_run_details.
  v_url := pg_catalog.btrim(coalesce(v_url, ''));
  IF v_url !~ '^https://[^/?#\s]+(/\S*)?$' THEN
    RAISE EXCEPTION 'check_cron_heartbeats_deadman: Vault secret cron_alert_webhook_url must be an https URL';
  END IF;

  FOR v_job IN
    SELECT t.job, t.interval_minutes
    FROM (VALUES
      -- intervals:begin (mirrors CRON_JOB_DEFINITIONS in apps/web/lib/monitoring/cron-heartbeat.ts)
      ('process-email-queue', 5),
      ('process-broadcasts', 5),
      ('daily-reminder', 60),
      ('weekly-recap', 60),
      ('lifecycle', 60),
      ('cleanup', 1440)
      -- intervals:end
    ) AS t(job, interval_minutes)
  LOOP
    v_threshold  := GREATEST(2 * v_job.interval_minutes, 30);
    v_marker_key := 'cron_deadman_alert:' || v_job.job;
    v_beat       := NULL;
    v_marker     := NULL;
    v_ref_ts     := NULL;

    SELECT s.value INTO v_beat FROM public.system_settings s WHERE s.key = 'cron_heartbeat:' || v_job.job;
    SELECT s.value INTO v_marker FROM public.system_settings s WHERE s.key = v_marker_key;
    IF v_marker IS NOT NULL AND pg_catalog.jsonb_typeof(v_marker) <> 'object' THEN
      v_marker := NULL;
    END IF;

    IF v_beat IS NULL OR pg_catalog.jsonb_typeof(v_beat) <> 'object' THEN
      -- Missing heartbeat: grace period from the first run that saw it missing.
      v_missing_since := v_marker ->> 'missing_since';
      BEGIN
        v_ref_ts := v_missing_since::timestamptz;
      EXCEPTION WHEN others THEN
        v_ref_ts := NULL;
      END;

      IF v_ref_ts IS NULL THEN
        INSERT INTO public.system_settings (key, value, updated_at)
        VALUES (
          v_marker_key,
          coalesce(v_marker, '{}'::jsonb) || pg_catalog.jsonb_build_object('job', v_job.job, 'missing_since', v_now),
          v_now
        )
        ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at;
        CONTINUE;
      END IF;

      IF v_now - v_ref_ts <= pg_catalog.make_interval(mins => v_threshold) THEN
        CONTINUE;
      END IF;

      v_episode := 'missing:' || v_missing_since;
      v_minutes := pg_catalog.floor(EXTRACT(EPOCH FROM (v_now - v_ref_ts)) / 60)::integer;
      v_message := pg_catalog.format(
        'Cron job %s has no heartbeat row (missing for %s minutes, expected every %s minutes). Seen by the database dead-man check.',
        v_job.job, v_minutes, v_job.interval_minutes
      );
    ELSE
      v_reference := coalesce(
        NULLIF(v_beat ->> 'last_success_at', ''),
        NULLIF(v_beat ->> 'first_run_at', ''),
        NULLIF(v_beat ->> 'last_run_at', '')
      );
      BEGIN
        v_ref_ts := v_reference::timestamptz;
      EXCEPTION WHEN others THEN
        v_ref_ts := NULL;
      END;

      -- An unreadable reference counts as overdue, like evaluateHeartbeat.
      IF v_ref_ts IS NOT NULL AND v_now - v_ref_ts <= pg_catalog.make_interval(mins => v_threshold) THEN
        CONTINUE;
      END IF;

      v_episode := coalesce(v_reference, 'unknown');
      v_minutes := CASE WHEN v_ref_ts IS NULL THEN NULL
                        ELSE pg_catalog.floor(EXTRACT(EPOCH FROM (v_now - v_ref_ts)) / 60)::integer END;
      v_message := pg_catalog.format(
        'Cron job %s has not succeeded for %s (expected every %s minutes). Seen by the database dead-man check.',
        v_job.job,
        CASE WHEN v_minutes IS NULL THEN 'an unknown time' ELSE v_minutes || ' minutes' END,
        v_job.interval_minutes
      );
    END IF;

    -- One alert per episode.
    IF (v_marker ->> 'episode') IS NOT DISTINCT FROM v_episode THEN
      CONTINUE;
    END IF;

    PERFORM net.http_post(
      url                  := v_url,
      body                 := pg_catalog.jsonb_build_object(
        'text', pg_catalog.format(E'[CRITICAL] cron_stale: cron.%s.deadman\n%s\nNext: %s\nIncident: %s',
                                  v_job.job, v_message, v_next_action, 'cron-deadman:' || v_job.job || ':' || v_episode),
        'incidentId', 'cron-deadman:' || v_job.job || ':' || v_episode,
        'severity', 'critical',
        'kind', 'cron_stale',
        'domain', 'cron',
        'operation', 'cron.' || v_job.job || '.deadman',
        'message', v_message,
        'nextAction', v_next_action,
        'fingerprint', 'cron_deadman:' || v_job.job
      ),
      headers              := pg_catalog.jsonb_build_object('Content-Type', 'application/json'),
      timeout_milliseconds := 10000
    );

    INSERT INTO public.system_settings (key, value, updated_at)
    VALUES (
      v_marker_key,
      coalesce(v_marker, '{}'::jsonb) || pg_catalog.jsonb_build_object('job', v_job.job, 'episode', v_episode, 'alerted_at', v_now),
      v_now
    )
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at;

    v_sent := v_sent + 1;
  END LOOP;

  RETURN v_sent;
END
$fn$;

COMMENT ON FUNCTION private.check_cron_heartbeats_deadman() IS
  'ENG-01 / W3: in-database dead-man check of public.system_settings cron_heartbeat:<job> rows; posts one alert per overdue episode to the Vault cron_alert_webhook_url. Called only by pg_cron (owner postgres).';

REVOKE ALL ON FUNCTION private.check_cron_heartbeats_deadman() FROM PUBLIC, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. Job (unschedule-if-exists, then schedule)
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'prodily-deadman-cron-heartbeats') THEN
    PERFORM cron.unschedule('prodily-deadman-cron-heartbeats');
  END IF;
END
$$;

SELECT cron.schedule(
  'prodily-deadman-cron-heartbeats',
  '*/15 * * * *',
  $cmd$SELECT private.check_cron_heartbeats_deadman()$cmd$
);

-- ---------------------------------------------------------------------------
-- 4. Self-check
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_job  record;
  v_fn   oid := to_regprocedure('private.check_cron_heartbeats_deadman()');
  v_role text;
BEGIN
  IF (SELECT count(*) FROM cron.job WHERE jobname = 'prodily-deadman-cron-heartbeats') <> 1 THEN
    RAISE EXCEPTION '20261030000001 FAILED: expected exactly one job named prodily-deadman-cron-heartbeats';
  END IF;

  SELECT schedule, command, active INTO v_job FROM cron.job WHERE jobname = 'prodily-deadman-cron-heartbeats';

  IF v_job.schedule <> '*/15 * * * *' THEN
    RAISE EXCEPTION '20261030000001 FAILED: dead-man job has schedule %, expected */15 * * * *', v_job.schedule;
  END IF;

  IF v_job.command <> 'SELECT private.check_cron_heartbeats_deadman()' THEN
    RAISE EXCEPTION '20261030000001 FAILED: dead-man job has an unexpected command';
  END IF;

  IF NOT v_job.active THEN
    RAISE EXCEPTION '20261030000001 FAILED: dead-man job is not active';
  END IF;

  IF v_fn IS NULL THEN
    RAISE EXCEPTION '20261030000001 FAILED: private.check_cron_heartbeats_deadman() is missing';
  END IF;

  IF NOT (SELECT prosecdef FROM pg_proc WHERE oid = v_fn) THEN
    RAISE EXCEPTION '20261030000001 FAILED: check_cron_heartbeats_deadman is not SECURITY DEFINER';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc WHERE oid = v_fn AND proconfig @> ARRAY['search_path=""']
  ) THEN
    RAISE EXCEPTION '20261030000001 FAILED: check_cron_heartbeats_deadman search_path is not pinned to empty';
  END IF;

  FOREACH v_role IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
    IF has_function_privilege(v_role, v_fn, 'EXECUTE') THEN
      RAISE EXCEPTION '20261030000001 FAILED: % can execute check_cron_heartbeats_deadman', v_role;
    END IF;
  END LOOP;

  -- Vault secret exists (its value is never read here).
  IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'cron_alert_webhook_url') THEN
    RAISE EXCEPTION '20261030000001 FAILED: create the Vault secret cron_alert_webhook_url first';
  END IF;

  RAISE NOTICE '20261030000001 self-check passed: dead-man check scheduled every 15 minutes';
END
$$;
