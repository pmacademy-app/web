-- Rollback for 20261024000003: pg_cron schedule for the /api/cron/* jobs.
--
-- Unschedules the six prodily-* jobs and drops the private.invoke_cron_endpoint helper. Run it in
-- the Supabase SQL editor. Safe to re-run.
--
-- Before running it, make sure the GitHub Actions `schedule:` block in
-- .github/workflows/notification-scheduler.yml is still present (or restore it first). Without
-- one of the two schedulers the email queue, reminders, recaps, lifecycle and cleanup stop, and
-- the cron heartbeat check raises stale alerts within two intervals.
--
-- Left in place on purpose:
--   - the pg_cron and pg_net extensions (dropping them would also drop any other job or request
--     history; they are inert without jobs),
--   - the Vault secrets cron_secret and site_url (delete them in Dashboard > Vault if wanted),
--   - the `private` schema, unless it is empty after the helper is dropped.

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

DROP FUNCTION IF EXISTS private.invoke_cron_endpoint(text, text);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'private')
     AND NOT EXISTS (
       SELECT 1 FROM pg_depend d
       JOIN pg_namespace n ON n.oid = d.refobjid
       WHERE n.nspname = 'private' AND d.refclassid = 'pg_namespace'::regclass AND d.deptype = 'n'
     ) THEN
    DROP SCHEMA private;
  END IF;
END
$$;

-- Self-check: no prodily-* job is left.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname LIKE 'prodily-%') THEN
    RAISE EXCEPTION '20261024000003 rollback FAILED: a prodily-* job is still scheduled';
  END IF;
  RAISE NOTICE '20261024000003 rollback complete: pg_cron jobs removed';
END
$$;
