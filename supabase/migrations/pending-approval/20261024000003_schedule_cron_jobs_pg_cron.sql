-- Phase 2 / PR-11 (ENG-01): run the scheduled /api/cron/* jobs from Supabase pg_cron + pg_net.
--
-- HELD IN pending-approval/. The Supabase CLI does not read this folder, so nothing here runs on
-- merge. The owner applies it by hand in the Supabase SQL editor, following
-- docs/ops/phase2-owner-runbook.md step (b).
--
-- Why: GitHub Actions scheduled runs fire about 10 times a day instead of the 313 configured
-- (audit ENG-01: median gap 103 min, worst 557 min), so the five-minute queue and the hourly
-- reminder, recap and lifecycle jobs ran late or not at all. pg_cron runs inside the database on
-- its own clock. pg_cron, pg_net and Vault are all available on the Supabase free tier.
--
-- What it does:
--
-- 1. Enables pg_cron and pg_net (IF NOT EXISTS, so re-running is a no-op).
--
-- 2. Adds private.invoke_cron_endpoint(path, method), a SECURITY DEFINER helper with a pinned,
--    empty search_path. At run time it reads two Vault secrets, `cron_secret` and `site_url`,
--    from vault.decrypted_secrets and fires one pg_net request with the same headers the GitHub
--    workflow's curl sends:
--      Authorization: Bearer <cron_secret>
--      Content-Type: application/json
--    The secret is read on every run and never stored in cron.job.command, so it does not show
--    up in cron.job or cron.job_run_details. The helper only accepts a path under /api/cron/ and
--    the methods GET or POST, and refuses a site_url that is not https. EXECUTE is revoked from
--    PUBLIC, anon, authenticated and service_role: only the job owner (postgres) calls it. The
--    `private` schema is not exposed through PostgREST.
--
-- 3. Schedules six jobs. The cadence and method match CRON_JOB_DEFINITIONS in
--    apps/web/lib/monitoring/cron-heartbeat.ts and .github/workflows/notification-scheduler.yml:
--      prodily-process-email-queue   */5 * * * *   POST /api/cron/process-email-queue
--      prodily-process-broadcasts    */5 * * * *   GET  /api/cron/process-broadcasts
--      prodily-daily-reminder        30 * * * *    POST /api/cron/daily-reminder
--      prodily-weekly-recap          30 * * * *    POST /api/cron/weekly-recap
--      prodily-lifecycle             30 * * * *    POST /api/cron/lifecycle
--      prodily-cleanup               30 20 * * *   POST /api/cron/cleanup   (02:00 IST)
--    pg_cron reads these times as UTC (the Supabase default for cron.timezone), as GitHub does.
--    /api/cron/retry-failed is deliberately NOT scheduled: it is deprecated and stays a manual
--    workflow_dispatch run.
--
-- 4. A DO $$ self-check that raises (and so rolls the whole script back) if a job, the helper,
--    its privileges or either Vault secret is missing or wrong.
--
-- Prerequisite: the Vault secrets `cron_secret` (same value as CRON_SECRET in Vercel) and
-- `site_url` (for example https://prodily.app, no trailing path) must exist before this runs.
-- The self-check refuses to finish without them.
--
-- Double triggering: the GitHub Actions schedules keep running until the owner removes them in a
-- follow-up. Both schedulers hitting the same endpoint is safe: every job dedupes on an
-- idempotency key (daily-reminder-<user>-<localDate>, weekly-recap-<user>-<isoWeek>,
-- lifecycle-<seq>-<user>-<localDate>) and the queue claim is row-locked.
--
-- pg_net timeout: 60 s per request. The reminder, recap and lifecycle routes stop paginating at
-- 50 s (MAX_EXECUTION_MS), and the queue run at 55 s, so a healthy run answers inside it. pg_net
-- is asynchronous: the job finishes as soon as the request is queued, and the HTTP status lands
-- in net._http_response. The route's own heartbeat (system_settings 'cron_heartbeat:<job>') is the
-- source of truth for whether a run worked.
--
-- Idempotent: CREATE EXTENSION IF NOT EXISTS, CREATE SCHEMA IF NOT EXISTS, CREATE OR REPLACE
-- FUNCTION, REVOKE, and an unschedule-if-exists guard before each job is scheduled.
-- Rollback: pending-approval/rollback/20261024000003_schedule_cron_jobs_pg_cron.down.sql.
-- Validation: pending-approval/validation/20261024000003_schedule_cron_jobs_pg_cron_validation.sql.

-- ---------------------------------------------------------------------------
-- 1. Extensions
-- ---------------------------------------------------------------------------

-- Supabase installs pg_cron into pg_catalog (it creates its own `cron` schema) and pg_net into
-- `extensions` (its functions live in the `net` schema either way).
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- ---------------------------------------------------------------------------
-- 2. Helper: read the Vault secrets and fire one request
-- ---------------------------------------------------------------------------

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.invoke_cron_endpoint(p_path text, p_method text DEFAULT 'POST')
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
  v_secret     text;
  v_site_url   text;
  v_method     text := upper(coalesce(p_method, ''));
  v_headers    jsonb;
  v_request_id bigint;
BEGIN
  IF p_path IS NULL OR p_path !~ '^/api/cron/[a-z][a-z-]*$' THEN
    RAISE EXCEPTION 'invoke_cron_endpoint: path % is not an /api/cron/ route', p_path;
  END IF;

  IF v_method NOT IN ('GET', 'POST') THEN
    RAISE EXCEPTION 'invoke_cron_endpoint: method % is not GET or POST', p_method;
  END IF;

  SELECT ds.decrypted_secret INTO v_secret
  FROM vault.decrypted_secrets ds
  WHERE ds.name = 'cron_secret'
  ORDER BY ds.created_at DESC
  LIMIT 1;

  SELECT ds.decrypted_secret INTO v_site_url
  FROM vault.decrypted_secrets ds
  WHERE ds.name = 'site_url'
  ORDER BY ds.created_at DESC
  LIMIT 1;

  -- Never echo the secret in an error: these messages land in cron.job_run_details.
  IF v_secret IS NULL OR length(v_secret) = 0 THEN
    RAISE EXCEPTION 'invoke_cron_endpoint: Vault secret cron_secret is missing or empty';
  END IF;

  v_site_url := rtrim(btrim(coalesce(v_site_url, '')), '/');
  IF v_site_url !~ '^https://[^/?#\s]+$' THEN
    RAISE EXCEPTION 'invoke_cron_endpoint: Vault secret site_url must be https://<host> with no path';
  END IF;

  -- Same two headers as the curl in .github/workflows/notification-scheduler.yml.
  v_headers := jsonb_build_object(
    'Authorization', 'Bearer ' || v_secret,
    'Content-Type', 'application/json'
  );

  IF v_method = 'POST' THEN
    SELECT net.http_post(
      url                  := v_site_url || p_path,
      body                 := '{}'::jsonb,
      headers              := v_headers,
      timeout_milliseconds := 60000
    ) INTO v_request_id;
  ELSE
    SELECT net.http_get(
      url                  := v_site_url || p_path,
      headers              := v_headers,
      timeout_milliseconds := 60000
    ) INTO v_request_id;
  END IF;

  RETURN v_request_id;
END
$fn$;

COMMENT ON FUNCTION private.invoke_cron_endpoint(text, text) IS
  'ENG-01: fires one pg_net request to an /api/cron/* route with the Vault cron_secret. Called only by pg_cron jobs (owner postgres).';

REVOKE ALL ON FUNCTION private.invoke_cron_endpoint(text, text) FROM PUBLIC, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. Jobs (unschedule-if-exists, then schedule)
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_name text;
BEGIN
  FOREACH v_name IN ARRAY ARRAY[
    'prodily-process-email-queue',
    'prodily-process-broadcasts',
    'prodily-daily-reminder',
    'prodily-weekly-recap',
    'prodily-lifecycle',
    'prodily-cleanup'
  ] LOOP
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = v_name) THEN
      PERFORM cron.unschedule(v_name);
    END IF;
  END LOOP;
END
$$;

SELECT cron.schedule('prodily-process-email-queue', '*/5 * * * *', $cmd$SELECT private.invoke_cron_endpoint('/api/cron/process-email-queue', 'POST')$cmd$);
SELECT cron.schedule('prodily-process-broadcasts', '*/5 * * * *', $cmd$SELECT private.invoke_cron_endpoint('/api/cron/process-broadcasts', 'GET')$cmd$);
SELECT cron.schedule('prodily-daily-reminder', '30 * * * *', $cmd$SELECT private.invoke_cron_endpoint('/api/cron/daily-reminder', 'POST')$cmd$);
SELECT cron.schedule('prodily-weekly-recap', '30 * * * *', $cmd$SELECT private.invoke_cron_endpoint('/api/cron/weekly-recap', 'POST')$cmd$);
SELECT cron.schedule('prodily-lifecycle', '30 * * * *', $cmd$SELECT private.invoke_cron_endpoint('/api/cron/lifecycle', 'POST')$cmd$);
SELECT cron.schedule('prodily-cleanup', '30 20 * * *', $cmd$SELECT private.invoke_cron_endpoint('/api/cron/cleanup', 'POST')$cmd$);

-- ---------------------------------------------------------------------------
-- 4. Self-check
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_expected record;
  v_job      record;
  v_fn       oid := to_regprocedure('private.invoke_cron_endpoint(text, text)');
  v_role     text;
BEGIN
  -- Every job exists once, is active, and has the expected schedule and command.
  FOR v_expected IN
    SELECT * FROM (VALUES
      ('prodily-process-email-queue', '*/5 * * * *', '/api/cron/process-email-queue', 'POST'),
      ('prodily-process-broadcasts',  '*/5 * * * *', '/api/cron/process-broadcasts',  'GET'),
      ('prodily-daily-reminder',      '30 * * * *',  '/api/cron/daily-reminder',      'POST'),
      ('prodily-weekly-recap',        '30 * * * *',  '/api/cron/weekly-recap',        'POST'),
      ('prodily-lifecycle',           '30 * * * *',  '/api/cron/lifecycle',           'POST'),
      ('prodily-cleanup',             '30 20 * * *', '/api/cron/cleanup',             'POST')
    ) AS t(jobname, schedule, path, method)
  LOOP
    IF (SELECT count(*) FROM cron.job WHERE jobname = v_expected.jobname) <> 1 THEN
      RAISE EXCEPTION '20261024000003 FAILED: expected exactly one job named %', v_expected.jobname;
    END IF;

    SELECT schedule, command, active INTO v_job FROM cron.job WHERE jobname = v_expected.jobname;

    IF v_job.schedule <> v_expected.schedule THEN
      RAISE EXCEPTION '20261024000003 FAILED: % has schedule %, expected %',
        v_expected.jobname, v_job.schedule, v_expected.schedule;
    END IF;

    IF v_job.command <> format('SELECT private.invoke_cron_endpoint(%L, %L)', v_expected.path, v_expected.method) THEN
      RAISE EXCEPTION '20261024000003 FAILED: % has an unexpected command', v_expected.jobname;
    END IF;

    IF NOT v_job.active THEN
      RAISE EXCEPTION '20261024000003 FAILED: % is not active', v_expected.jobname;
    END IF;
  END LOOP;

  -- retry-failed stays manual.
  IF EXISTS (SELECT 1 FROM cron.job WHERE command LIKE '%/api/cron/retry-failed%') THEN
    RAISE EXCEPTION '20261024000003 FAILED: retry-failed must not be scheduled';
  END IF;

  -- Helper: SECURITY DEFINER, pinned search_path, no end-user EXECUTE.
  IF v_fn IS NULL THEN
    RAISE EXCEPTION '20261024000003 FAILED: private.invoke_cron_endpoint(text, text) is missing';
  END IF;

  IF NOT (SELECT prosecdef FROM pg_proc WHERE oid = v_fn) THEN
    RAISE EXCEPTION '20261024000003 FAILED: invoke_cron_endpoint is not SECURITY DEFINER';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc WHERE oid = v_fn AND proconfig @> ARRAY['search_path=""']
  ) THEN
    RAISE EXCEPTION '20261024000003 FAILED: invoke_cron_endpoint search_path is not pinned to empty';
  END IF;

  FOREACH v_role IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
    IF has_function_privilege(v_role, v_fn, 'EXECUTE') THEN
      RAISE EXCEPTION '20261024000003 FAILED: % can execute invoke_cron_endpoint', v_role;
    END IF;
  END LOOP;

  -- Vault secrets exist (values are never read here).
  IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'cron_secret') THEN
    RAISE EXCEPTION '20261024000003 FAILED: create the Vault secret cron_secret first (runbook step b)';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'site_url') THEN
    RAISE EXCEPTION '20261024000003 FAILED: create the Vault secret site_url first (runbook step b)';
  END IF;

  RAISE NOTICE '20261024000003 self-check passed: 6 jobs scheduled';
END
$$;
