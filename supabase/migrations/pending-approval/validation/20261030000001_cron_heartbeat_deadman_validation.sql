-- Validation for 20261030000001: in-database dead-man check for the cron heartbeats (ENG-01, audit W3).
--
-- READ-ONLY. Safe on production. It reads cron.job, cron.job_run_details, pg_proc,
-- net._http_response and vault.secrets (names and timestamps only). It never reads
-- vault.decrypted_secrets and never prints the webhook URL.
--
-- Usage: paste into the Supabase SQL editor after applying the migration. The editor shows only
-- the last result, so select one numbered query at a time and run the selection.
--   Query 1 raises if the setup is wrong; otherwise it ends with a 'validation passed' notice.
--   Queries 2 and 4 show the details behind query 1.
--   Query 3 is for 30 minutes or more after applying, when the job has run at least twice.

-- 1. Setup check: the job exists, runs every 15 minutes and is active. The DO block also checks
--    the function, its privileges and the Vault secret, and raises on any mismatch.
SELECT jobid, jobname, schedule, command, active
FROM cron.job
WHERE jobname = 'prodily-deadman-cron-heartbeats';

DO $$
DECLARE
  v_fn   oid := to_regprocedure('private.check_cron_heartbeats_deadman()');
  v_role text;
BEGIN
  IF (SELECT count(*) FROM cron.job WHERE jobname = 'prodily-deadman-cron-heartbeats') <> 1 THEN
    RAISE EXCEPTION '20261030000001 validation FAILED: expected exactly one job named prodily-deadman-cron-heartbeats';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM cron.job
    WHERE jobname = 'prodily-deadman-cron-heartbeats'
      AND schedule = '*/15 * * * *'
      AND command = 'SELECT private.check_cron_heartbeats_deadman()'
      AND active
  ) THEN
    RAISE EXCEPTION '20261030000001 validation FAILED: dead-man job schedule, command or active flag is wrong';
  END IF;

  IF v_fn IS NULL THEN
    RAISE EXCEPTION '20261030000001 validation FAILED: private.check_cron_heartbeats_deadman() is missing';
  END IF;

  IF NOT (SELECT prosecdef FROM pg_proc WHERE oid = v_fn) THEN
    RAISE EXCEPTION '20261030000001 validation FAILED: check_cron_heartbeats_deadman is not SECURITY DEFINER';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE oid = v_fn AND proconfig @> ARRAY['search_path=""']) THEN
    RAISE EXCEPTION '20261030000001 validation FAILED: check_cron_heartbeats_deadman search_path is not pinned to empty';
  END IF;

  FOREACH v_role IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
    IF has_function_privilege(v_role, v_fn, 'EXECUTE') THEN
      RAISE EXCEPTION '20261030000001 validation FAILED: % can execute check_cron_heartbeats_deadman', v_role;
    END IF;
  END LOOP;

  IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'cron_alert_webhook_url') THEN
    RAISE EXCEPTION '20261030000001 validation FAILED: Vault secret cron_alert_webhook_url is missing';
  END IF;

  RAISE NOTICE '20261030000001 validation passed: dead-man check scheduled every 15 minutes';
END
$$;

-- 2. The function: SECURITY DEFINER, search_path pinned to empty, and no EXECUTE for anon,
--    authenticated or service_role. Expect one row: true, {search_path=""}, false, false, false.
SELECT p.oid::regprocedure AS function,
       p.prosecdef AS security_definer,
       p.proconfig AS config,
       has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_can_execute,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_can_execute,
       has_function_privilege('service_role', p.oid, 'EXECUTE') AS service_role_can_execute
FROM pg_proc p
WHERE p.oid = to_regprocedure('private.check_cron_heartbeats_deadman()');

-- 3a. Recent runs (last 2 hours). status should be 'succeeded'. A 'failed' row's return_message
--     names the problem, for example a missing or non-https Vault secret. Expect one run every
--     15 minutes.
SELECT d.status, d.return_message, d.start_time, d.end_time
FROM cron.job_run_details d
JOIN cron.job j ON j.jobid = d.jobid
WHERE j.jobname = 'prodily-deadman-cron-heartbeats'
  AND d.start_time > now() - interval '2 hours'
ORDER BY d.start_time DESC
LIMIT 20;

-- 3b. Webhook answers from pg_net (kept about 6 hours). The dead-man check posts only when a job is
--     overdue, so this is usually empty or shows other jobs' requests. After an alert, expect
--     status_code 200 (or 204). A 4xx means the webhook rejected it; pg_net does not retry.
SELECT id, status_code, timed_out, error_msg, created
FROM net._http_response
WHERE created > now() - interval '2 hours'
ORDER BY created DESC
LIMIT 50;

-- 4. The Vault secret exists. Name and timestamps only; the value is never selected.
SELECT name, created_at, updated_at
FROM vault.secrets
WHERE name = 'cron_alert_webhook_url';
