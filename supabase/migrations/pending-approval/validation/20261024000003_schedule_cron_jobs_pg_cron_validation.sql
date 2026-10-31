-- Validation for 20261024000003: pg_cron schedule for the /api/cron/* jobs.
--
-- READ-ONLY. Safe on production. It reads cron.job, cron.job_run_details and net._http_response
-- and never prints a secret value (cron.job.command only names the helper; the secret is read
-- from Vault at run time).
--
-- Usage: paste into the Supabase SQL editor after applying the migration. The editor shows only
-- the last result, so select one numbered query at a time and run the selection.
--   Query 1 raises if the setup is wrong; otherwise it returns one row per job.
--   Queries 2 and 3 are for 15 minutes or more after applying, when runs have happened.

-- 1. Setup check: the six jobs, their cadence, and that they are active. Raises on any mismatch.
DO $$
DECLARE
  v_count integer;
BEGIN
  SELECT count(*) INTO v_count
  FROM cron.job j
  JOIN (VALUES
    ('prodily-process-email-queue', '*/5 * * * *', 'SELECT private.invoke_cron_endpoint(''/api/cron/process-email-queue'', ''POST'')'),
    ('prodily-process-broadcasts',  '*/5 * * * *', 'SELECT private.invoke_cron_endpoint(''/api/cron/process-broadcasts'', ''GET'')'),
    ('prodily-daily-reminder',      '30 * * * *',  'SELECT private.invoke_cron_endpoint(''/api/cron/daily-reminder'', ''POST'')'),
    ('prodily-weekly-recap',        '30 * * * *',  'SELECT private.invoke_cron_endpoint(''/api/cron/weekly-recap'', ''POST'')'),
    ('prodily-lifecycle',           '30 * * * *',  'SELECT private.invoke_cron_endpoint(''/api/cron/lifecycle'', ''POST'')'),
    ('prodily-cleanup',             '30 20 * * *', 'SELECT private.invoke_cron_endpoint(''/api/cron/cleanup'', ''POST'')')
  ) AS e(jobname, schedule, command)
    ON e.jobname = j.jobname AND e.schedule = j.schedule AND e.command = j.command AND j.active;

  IF v_count <> 6 THEN
    RAISE EXCEPTION '20261024000003 validation FAILED: % of 6 jobs match the expected schedule', v_count;
  END IF;

  IF (SELECT count(*) FROM cron.job WHERE jobname LIKE 'prodily-%') <> 6 THEN
    RAISE EXCEPTION '20261024000003 validation FAILED: unexpected extra prodily-* jobs';
  END IF;

  IF EXISTS (SELECT 1 FROM cron.job WHERE command LIKE '%/api/cron/retry-failed%') THEN
    RAISE EXCEPTION '20261024000003 validation FAILED: retry-failed is scheduled; it must stay manual';
  END IF;

  IF has_function_privilege('anon', 'private.invoke_cron_endpoint(text, text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'private.invoke_cron_endpoint(text, text)', 'EXECUTE') THEN
    RAISE EXCEPTION '20261024000003 validation FAILED: anon or authenticated can execute the helper';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'cron_secret')
     OR NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'site_url') THEN
    RAISE EXCEPTION '20261024000003 validation FAILED: Vault secret cron_secret or site_url is missing';
  END IF;

  RAISE NOTICE '20261024000003 validation passed: 6 jobs scheduled and active';
END
$$;

SELECT jobid, jobname, schedule, command, active
FROM cron.job
WHERE jobname LIKE 'prodily-%'
ORDER BY jobname;

-- 2. Recent runs (last 2 hours). status should be 'succeeded'. A 'failed' row's return_message
--    names the problem (for example a missing Vault secret). 'succeeded' only means the request
--    was queued; query 3 shows what the endpoint answered.
SELECT j.jobname, d.status, d.return_message, d.start_time, d.end_time
FROM cron.job_run_details d
JOIN cron.job j ON j.jobid = d.jobid
WHERE j.jobname LIKE 'prodily-%'
  AND d.start_time > now() - interval '2 hours'
ORDER BY d.start_time DESC
LIMIT 50;

-- 3. HTTP results from pg_net (kept about 6 hours). Expect status_code 200. 401 means the Vault
--    cron_secret does not match CRON_SECRET in Vercel; timed_out or a null status means the
--    endpoint took longer than 60 s or site_url is wrong.
SELECT id, status_code, timed_out, error_msg, created
FROM net._http_response
WHERE created > now() - interval '2 hours'
ORDER BY created DESC
LIMIT 50;

-- 4. Per-job heartbeats written by the routes themselves (the source of truth for a working run).
SELECT key, value ->> 'status' AS status, value ->> 'last_run_at' AS last_run_at,
       value ->> 'last_success_at' AS last_success_at, value ->> 'error' AS error
FROM public.system_settings
WHERE key LIKE 'cron_heartbeat:%'
ORDER BY key;
