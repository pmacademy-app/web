-- Rollback for 20261030000001: in-database dead-man check for the cron heartbeats (ENG-01, audit W3).
--
-- Unschedules prodily-deadman-cron-heartbeats, drops private.check_cron_heartbeats_deadman() and
-- deletes the dead-man alert markers (public.system_settings keys 'cron_deadman_alert:<job>').
-- Run it in the Supabase SQL editor. Safe to re-run.
--
-- The markers only record which outage episode was already alerted. Deleting them loses nothing
-- the app reads: the app's own markers ('cron_heartbeat_alert:<job>') and the heartbeat rows
-- ('cron_heartbeat:<job>') are left alone. If the migration is applied again later, a job that is
-- still overdue alerts once more.
--
-- Left in place on purpose (20261024000003 and other jobs use them):
--   - the pg_cron and pg_net extensions,
--   - the `private` schema and its other functions (private.invoke_cron_endpoint),
--   - the Vault secret cron_alert_webhook_url (delete it in Dashboard > Vault if wanted).

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'prodily-deadman-cron-heartbeats') THEN
    PERFORM cron.unschedule('prodily-deadman-cron-heartbeats');
  END IF;
END
$$;

DROP FUNCTION IF EXISTS private.check_cron_heartbeats_deadman();

DELETE FROM public.system_settings WHERE key LIKE 'cron\_deadman\_alert:%';

-- Self-check: the job, the function and the markers are gone.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'prodily-deadman-cron-heartbeats') THEN
    RAISE EXCEPTION '20261030000001 rollback FAILED: prodily-deadman-cron-heartbeats is still scheduled';
  END IF;

  IF to_regprocedure('private.check_cron_heartbeats_deadman()') IS NOT NULL THEN
    RAISE EXCEPTION '20261030000001 rollback FAILED: private.check_cron_heartbeats_deadman() still exists';
  END IF;

  IF EXISTS (SELECT 1 FROM public.system_settings WHERE key LIKE 'cron\_deadman\_alert:%') THEN
    RAISE EXCEPTION '20261030000001 rollback FAILED: cron_deadman_alert:* rows are still present';
  END IF;

  RAISE NOTICE '20261030000001 rollback complete: dead-man job, function and alert markers removed';
END
$$;
