-- Rollback for 20260913000001_xp_event_uniqueness_b8e.sql (B8-E / F-COR-3)
--
-- Written BEFORE the forward migration is applied, per FINAL_IMPLEMENTATION_PLAN §12.4.
--
-- ⚠️  THIS RESTORES THE CONSTRAINT STATE ONLY. It does NOT restore the deleted
--     duplicate rows — those are recoverable only from the logical backup taken
--     immediately before the forward apply. That is why the backup is mandatory.
--
-- Running this returns the schema to its pre-B8-E shape: duplicates become insertable
-- again, and `awardXp()`'s check-then-insert is once more the only guard.

SET search_path TO public;

BEGIN;

-- Restore the non-unique index the forward migration dropped as redundant.
CREATE INDEX IF NOT EXISTS idx_xp_events_user_source
  ON public.xp_events (user_id, source_type, source_id);

-- Remove the uniqueness guarantee.
ALTER TABLE public.xp_events
  DROP CONSTRAINT IF EXISTS xp_events_user_source_unique;

COMMIT;

-- After rolling back, any application code that relies on
-- `ON CONFLICT (user_id, source_type, source_id)` will fail with
-- "there is no unique or exclusion constraint matching the ON CONFLICT specification".
-- Revert that code in the same operation — see docs/audits/B8E_XP_UNIQUENESS.md.
