-- Phase 4 — Re-cut the unit of work: Deep-dive engagement marker.
--
-- IMPLEMENTATION_PLAN.md §4.4 requires Deep-dive engagement to be counted in the
-- server-side Phase 2 funnel "so depth consumption is observable rather than assumed".
-- GA4 is consent-gated (correction C2) and cannot supply this for the whole cohort, so we
-- persist a first-touch marker on the existing lesson-progress row.
--
-- Additive and nullable: no backfill, no data change. Existing rows keep NULL, which the
-- funnel reads as "has not opened the Deep-dive" — correct, because they never had one to
-- open. Mirrors `theory_read_at` in shape and semantics (set once, on first open).
--
-- This migration must be APPLIED before the code that writes the column is deployed
-- (same ordering discipline as every additive column in this repo). It is safe to leave
-- applied on rollback of the Phase 4 code — the column simply goes unwritten.

ALTER TABLE public.user_lesson_progress
  ADD COLUMN IF NOT EXISTS deep_dive_opened_at timestamptz;

COMMENT ON COLUMN public.user_lesson_progress.deep_dive_opened_at IS
  'Phase 4: first time the learner expanded the optional Deep-dive section for this lesson. NULL = never opened. Set once, never cleared.';
