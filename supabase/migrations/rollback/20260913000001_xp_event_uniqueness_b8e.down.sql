-- Rollback for 20260913000001_xp_event_uniqueness_b8e.sql (B8-E / F-COR-3)
--
-- Written BEFORE the forward migration is applied, per FINAL_IMPLEMENTATION_PLAN §12.4.
--
-- ⚠️  THIS RESTORES THE CONSTRAINT STATE ONLY. It does NOT restore the deleted
--     theory_read rows — those are recoverable only from the logical backup taken
--     immediately before the forward apply. That is why the backup is mandatory.
--
-- Running this returns the schema to its pre-B8-E shape: repeat theory_read /
-- quiz_bonus / reflection / streak / referral / capstone rows become insertable again,
-- and the check-then-write guards in application code are once more the only defence.

SET search_path TO public;

BEGIN;

-- Remove the scoped uniqueness guarantee.
DROP INDEX IF EXISTS public.xp_events_once_only_source_unique;

COMMIT;

-- The forward migration does not drop idx_xp_events_user_source, so there is nothing
-- to restore here — the general lookup index was retained throughout.
--
-- After rolling back, any application code that relies on the unique violation
-- (SQLSTATE 23505) to detect an already-awarded event will stop seeing it and will fall
-- back to its check-then-write behaviour. That is a silent behaviour change, not an
-- error, so revert that code in the same operation.
-- See docs/audits/B8E_PRE_APPROVAL_INVESTIGATION.md.
