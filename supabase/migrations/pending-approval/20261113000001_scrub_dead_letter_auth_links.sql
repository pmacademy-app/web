-- ADR-005 gap / SEC-17 (data minimisation, queue part): scrub the one-time auth links still held
-- by email_queue rows that already dead-lettered or failed.
--
-- HELD IN pending-approval/. The Supabase CLI does not read this folder, so nothing here runs on
-- merge. The owner applies it by hand in the Supabase SQL editor, once, after the app change ships.
--
-- Why: until AG-02, a dead-lettered email kept its template_variables. For auth.verify_email and
-- auth.password_reset that includes the one-time link with its token (verificationUrl, resetUrl),
-- readable by every admin, and the 90-day retention delete is not enabled yet. AG-02 makes the
-- queue processor replace the variables of every auth.* row it dead-letters (and delivers) with
-- the marker {"_scrubbed": "dead_letter"} (apps/web/lib/notifications/queue/processor.ts). This
-- one-off does the same for rows written before that change.
--
-- What it does: for email_queue rows with status 'dead_letter' or 'failed' and a template_key
-- starting with 'auth.', set template_variables to {"_scrubbed": "dead_letter"}. The column is
-- NOT NULL DEFAULT '{}', so the marker is written instead of NULL; the admin retry routes read it
-- and refuse to requeue the row ("This sign-in email expired. Ask the learner to request a new
-- one."). updated_at is left alone on purpose: the retention rules count from it.
-- Rows in pending, retrying, processing and every other status are not touched: they may still
-- be sent and need their variables.
--
-- Preconditions: the AG-02 app change is deployed (otherwise an older instance can still write
-- unscrubbed dead letters, and an admin could requeue a scrubbed row into a broken email).
--
-- No export step: the only data removed is the expired one-time links themselves. Exporting them
-- would copy the secret this migration exists to remove.
--
-- Idempotent: rows already holding the marker are skipped. Safe to re-run. No schema change,
-- nothing granted or revoked.
--
-- Rollback: rollback/20261113000001_scrub_dead_letter_auth_links.down.sql is a documented no-op.
-- The scrubbed values cannot be restored, and the links had expired anyway.
-- Validation: validation/20261113000001_scrub_dead_letter_auth_links_validation.sql (read-only,
-- expects 0 unscrubbed rows).

SET search_path = public, pg_temp;

-- Optional, before running: how many rows will change.
--   SELECT template_key, status, count(*)
--   FROM public.email_queue
--   WHERE status IN ('dead_letter', 'failed')
--     AND template_key LIKE 'auth.%'
--     AND template_variables IS DISTINCT FROM '{"_scrubbed": "dead_letter"}'::jsonb
--   GROUP BY template_key, status;

UPDATE public.email_queue
SET template_variables = '{"_scrubbed": "dead_letter"}'::jsonb
WHERE status IN ('dead_letter', 'failed')
  AND template_key LIKE 'auth.%'
  AND template_variables IS DISTINCT FROM '{"_scrubbed": "dead_letter"}'::jsonb;

-- Self-check: no dead-lettered or failed auth row keeps any variable besides the marker.
DO $$
DECLARE
  v_left integer;
BEGIN
  SELECT count(*) INTO v_left
  FROM public.email_queue
  WHERE status IN ('dead_letter', 'failed')
    AND template_key LIKE 'auth.%'
    AND (
      jsonb_typeof(template_variables) <> 'object'
      OR (template_variables - '_scrubbed') <> '{}'::jsonb
    );

  IF v_left <> 0 THEN
    RAISE EXCEPTION '20261113000001 FAILED: % dead-lettered or failed auth row(s) still carry template variables', v_left;
  END IF;

  RAISE NOTICE '20261113000001 applied: dead-lettered and failed auth rows hold no template variables';
END $$;
