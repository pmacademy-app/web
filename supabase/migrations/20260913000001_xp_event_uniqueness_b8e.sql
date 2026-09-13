-- Prodily — B8-E · XP event uniqueness (SCOPED)
-- Migration: 20260913000001_xp_event_uniqueness_b8e.sql
-- Addresses: F-COR-3
--
-- ⚠️  DESTRUCTIVE. This migration DELETES rows from public.xp_events.
--     Do not apply without:
--       1. a reviewed B8-D diagnostic report + the B8-E investigation
--          (docs/archive/B8E_XP_UNIQUENESS_EXECUTION.md),
--       2. explicit human approval to delete the excess rows,
--       3. a fresh logical backup taken immediately beforehand.
--     Deleted rows are recoverable ONLY from that backup.
--
-- ── Why this migration is SCOPED, and why a blanket UNIQUE would be wrong ────
--
-- The first draft of this file added UNIQUE (user_id, source_type, source_id) across
-- the whole table and deleted every duplicate. Investigation against production
-- (2026-09-13) showed that would have been destructive and wrong: three source types
-- legitimately produce more than one row per (user_id, source_type, source_id).
--
--   quiz_correct  — lib/academy/lessons-db.ts:247-289 awards an INCREMENT
--                   (maxPossible - alreadyAwarded) each time a learner improves a quiz
--                   score. Observed sequences like [20,50] and [5,45,25] are separate
--                   earnings, not repeats. Deleting the later rows would have destroyed
--                   280 XP across 5 users.
--   flashcard     — lib/flashcards-service.ts:240-266 awards once per DAY per card, so
--                   the same card legitimately recurs on later days.
--   user_reset    — lib/settings/settings-service.ts:130 uses the CONSTANT source_id
--                   'settings_reset', so every account reset collides with the last.
--                   One user has two. Deleting the second would have GIVEN BACK 80 XP
--                   that the learner had deliberately reset away.
--
-- A blanket constraint would also have broken all three features going forward: the
-- second award would raise a unique violation, and under ON CONFLICT DO NOTHING would
-- be silently dropped.
--
-- So the constraint is scoped to the source types that are genuinely once-only, and the
-- dedupe is scoped to match.
--
-- ── Scope, measured against production on 2026-09-13 ─────────────────────────
--   rows scanned ................... 1636
--   duplicate groups (all types) ... 46   (50 excess rows, 510 XP, 16 users)
--     of which:
--       concurrency race ........... 29 groups, 31 rows, 310 XP, 13 users  <- DELETED
--         all theory_read; consecutive gaps 4 ms .. 1009 ms
--       quiz incremental top-up .... 16 groups, 18 rows, 280 XP, 5 users   <- KEPT
--       repeat account reset ....... 1 group,   1 row,  -80 XP, 1 user     <- KEPT
--
--   THIS MIGRATION DELETES 31 ROWS AND REMOVES 310 XP FROM 13 USERS.
--
-- ── Why step 2 exists, and why omitting it would corrupt totals ──────────────
-- `trigger_update_user_xp` fires AFTER INSERT ON xp_events ONLY
-- (20260728000002_create_user_state.sql:101-104). There is no delete trigger, so
-- removing ledger rows does NOT reduce `users.total_xp`. Without step 2 the 13 affected
-- users would keep 310 XP with no ledger behind it, and `level` derives from
-- `total_xp`, so some could sit at an inflated level permanently.
--
-- `trigger_sync_user_xp_on_update` fires BEFORE UPDATE ON users and recomputes
-- `total_xp`/`level` from the ledger, so a no-op touch of each affected row re-derives
-- the correct values. Step 2 performs that touch.

SET search_path TO public;

BEGIN;

-- ── Step 0 · The source types that must never repeat ─────────────────────────
-- Derived by auditing every awardXp() call site. Each of these is guarded by a
-- check-then-write today, which is what races.
--
--   theory_read  lessonId          — one read per lesson
--   quiz_bonus   lessonId          — one perfect-score bonus per lesson
--   reflection   lessonId          — one reflection award per lesson
--   streak       'streak-<date>'   — id already carries the day
--   referral     referral.id       — one activation per referral
--   capstone     moduleSlug        — one submission award per module
--
-- Deliberately EXCLUDED: quiz_correct, flashcard, user_reset, admin_reset. See header.
CREATE TEMP TABLE b8e_once_only_types (source_type text PRIMARY KEY) ON COMMIT DROP;
INSERT INTO b8e_once_only_types (source_type) VALUES
  ('theory_read'), ('quiz_bonus'), ('reflection'), ('streak'), ('referral'), ('capstone');

-- ── Step 1 · Capture the rows to remove ──────────────────────────────────────
-- Materialised first so steps 2 and 3 act on the same set, and so the row counts can
-- be inspected inside the transaction before COMMIT.
CREATE TEMP TABLE b8e_excess_xp_events ON COMMIT DROP AS
SELECT id, user_id
FROM (
  SELECT
    e.id,
    e.user_id,
    row_number() OVER (
      PARTITION BY e.user_id, e.source_type, e.source_id
      -- Keep the earliest row; break exact ties on id so the choice is deterministic.
      ORDER BY e.created_at ASC, e.id ASC
    ) AS rn
  FROM public.xp_events e
  JOIN b8e_once_only_types t ON t.source_type = e.source_type
  -- NULL source_id cannot collide under a UNIQUE index, so those rows are not
  -- duplicates for this purpose and must not be deleted.
  WHERE e.source_id IS NOT NULL
) ranked
WHERE ranked.rn > 1;

CREATE TEMP TABLE b8e_affected_users ON COMMIT DROP AS
SELECT DISTINCT user_id FROM b8e_excess_xp_events;

-- ── Step 2 · Delete the excess rows ──────────────────────────────────────────
DELETE FROM public.xp_events e
USING b8e_excess_xp_events x
WHERE e.id = x.id;

-- ── Step 3 · Re-derive total_xp and level for affected users ─────────────────
-- The no-op SET is intentional: the BEFORE UPDATE trigger overwrites both columns
-- from the ledger, so touching the row is what recalculates it.
UPDATE public.users u
SET total_xp = u.total_xp
FROM b8e_affected_users a
WHERE u.id = a.user_id;

-- ── Step 4 · Enforce uniqueness going forward, for the once-only types only ──
-- A PARTIAL unique index, because the guarantee must not extend to quiz_correct,
-- flashcard or user_reset.
--
-- NOTE FOR THE APPLICATION-SIDE FOLLOW-UP: a partial index cannot be inferred as an
-- `INSERT ... ON CONFLICT (cols)` target without restating its WHERE clause, and
-- PostgREST cannot express that. The follow-up must therefore treat a unique-violation
-- error (SQLSTATE 23505) as "already awarded" rather than using ON CONFLICT.
-- See docs/archive/B8E_XP_UNIQUENESS_EXECUTION.md §5.
CREATE UNIQUE INDEX IF NOT EXISTS xp_events_once_only_source_unique
  ON public.xp_events (user_id, source_type, source_id)
  WHERE source_id IS NOT NULL
    AND source_type IN ('theory_read', 'quiz_bonus', 'reflection', 'streak', 'referral', 'capstone');

-- The pre-existing non-unique index on (user_id, source_type, source_id) is RETAINED.
-- The partial unique index above covers only six source types, so the general lookup
-- index is still doing work for quiz_correct, flashcard and user_reset.

COMMIT;
