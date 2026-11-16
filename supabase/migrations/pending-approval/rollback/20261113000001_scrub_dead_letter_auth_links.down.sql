-- Rollback for 20261113000001: scrub the one-time auth links held by dead-lettered and failed
-- email_queue rows (ADR-005 gap, SEC-17).
--
-- DOCUMENTED NO-OP. The forward migration overwrote template_variables with the marker
-- {"_scrubbed": "dead_letter"}. The original values (the one-time verification and password-reset
-- links) were not kept anywhere, on purpose, so they cannot be restored. They had expired before
-- the scrub in any case, so a restored row would only send a broken link.
--
-- If a scrubbed email must reach the learner, ask them to request a new one (sign-up
-- verification resend or "Forgot password"). Do not requeue the scrubbed row: the admin retry
-- routes refuse it.
--
-- Nothing below changes data. Safe to re-run.

DO $$
BEGIN
  RAISE NOTICE '20261113000001 rollback: nothing to undo. Scrubbed auth links cannot be restored.';
END $$;
