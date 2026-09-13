-- Prodily — B8-E · XP event uniqueness
-- Migration: 20260913000001_xp_event_uniqueness_b8e.sql
-- Addresses: F-COR-3
--
-- ⚠️  DESTRUCTIVE. This migration DELETES rows from public.xp_events.
--     Do not apply without:
--       1. a reviewed B8-D diagnostic report (docs/audits/B8D_XP_DUPLICATES_REPORT.txt),
--       2. explicit human approval to delete the excess rows,
--       3. a fresh logical backup taken immediately beforehand.
--     Deleted rows are recoverable ONLY from that backup.
--
-- ── Why ──────────────────────────────────────────────────────────────────────
-- `xp_events` carries only a NON-unique index on (user_id, source_type, source_id)
-- (20260824000001_phase9_perf_indexes.sql:5-6). `awardXp()` guards repeats with a
-- check-then-insert, which races, so concurrent identical awards both land.
--
-- ── Scope, measured against production on 2026-09-13 (B8-D) ──────────────────
--   rows scanned .......... 1636
--   duplicate groups ...... 46
--   excess rows ........... 50   <- deleted by step 1
--   XP at stake ........... 510
--   users affected ........ 16
--
-- ── Why step 2 exists, and why omitting it would corrupt totals ──────────────
-- `trigger_update_user_xp` fires AFTER INSERT ON xp_events ONLY
-- (20260728000002_create_user_state.sql:101-104). There is no delete trigger, so
-- removing ledger rows does NOT reduce `users.total_xp` — it would leave 16 users
-- holding 510 XP that no longer has any ledger behind it, and `level` derives from
-- `total_xp`, so some could sit at an inflated level permanently.
--
-- `trigger_sync_user_xp_on_update` fires BEFORE UPDATE ON users and recomputes
-- `total_xp`/`level` from the ledger, so a no-op touch of each affected row is what
-- re-derives the correct values. Step 2 performs that touch.

SET search_path TO public;

BEGIN;

-- ── Step 0 · Capture the rows to remove ──────────────────────────────────────
-- Materialised first so steps 1 and 2 act on the same set, and so the row counts
-- can be inspected inside the transaction before COMMIT.
CREATE TEMP TABLE b8e_excess_xp_events ON COMMIT DROP AS
SELECT id, user_id
FROM (
  SELECT
    id,
    user_id,
    row_number() OVER (
      PARTITION BY user_id, source_type, source_id
      -- Keep the earliest row; break exact ties on id so the choice is deterministic.
      ORDER BY created_at ASC, id ASC
    ) AS rn
  FROM public.xp_events
  -- NULL source_id cannot collide under a UNIQUE constraint, so those rows are not
  -- duplicates for this purpose and must not be deleted.
  WHERE source_id IS NOT NULL
) ranked
WHERE ranked.rn > 1;

CREATE TEMP TABLE b8e_affected_users ON COMMIT DROP AS
SELECT DISTINCT user_id FROM b8e_excess_xp_events;

-- ── Step 1 · Delete the excess rows ──────────────────────────────────────────
DELETE FROM public.xp_events e
USING b8e_excess_xp_events x
WHERE e.id = x.id;

-- ── Step 2 · Re-derive total_xp and level for affected users ─────────────────
-- The no-op SET is intentional: the BEFORE UPDATE trigger overwrites both columns
-- from the ledger, so touching the row is what recalculates it.
UPDATE public.users u
SET total_xp = u.total_xp
FROM b8e_affected_users a
WHERE u.id = a.user_id;

-- ── Step 3 · Enforce uniqueness going forward ────────────────────────────────
-- A plain UNIQUE constraint, deliberately NOT a partial unique index.
--
-- Postgres treats NULLs as distinct in a unique index by default (NULLS DISTINCT), so
-- rows with a NULL source_id already coexist freely — the partial predicate this first
-- carried bought nothing, and a partial index cannot be inferred as an
-- `INSERT ... ON CONFLICT (cols)` target without restating its WHERE clause, which
-- PostgREST cannot express. A plain constraint keeps the conflict target usable.
ALTER TABLE public.xp_events
  ADD CONSTRAINT xp_events_user_source_unique
  UNIQUE (user_id, source_type, source_id);

-- The non-unique index this supersedes is now redundant: the unique index covers the
-- same leading columns and serves the same lookups.
DROP INDEX IF EXISTS public.idx_xp_events_user_source;

COMMIT;
