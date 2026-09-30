-- Phase 8.2 — Close the capstone review loop: review lifecycle timestamp.
--
-- docs/PHASE_8_PROPOSAL.md §8.2 and ADR-010: submitting a capstone is the product's best moment,
-- but after submission nothing reaches the learner and review turnaround cannot be measured. The
-- review lifecycle is `submitted → reviewed`, yet `capstone_submissions` records no WHEN: the table
-- had only content, id, is_public, module_slug, status, submitted_at, user_id. Without a review
-- timestamp there is no way to measure turnaround, prioritise aging submissions, or later decide on
-- a real SLA from observed capacity.
--
-- This adds the single additive, nullable column the proposal identifies — `reviewed_at` — plus an
-- optional `reviewed_by` for auditability. Both are additive and nullable:
--   * No backfill. Existing rows keep NULL, which the app reads as "not yet reviewed" — correct,
--     because those submissions were never reviewed through this loop. A row whose status is already
--     'reviewed' but whose reviewed_at is NULL is treated as reviewed at an unknown time (its
--     status is authoritative); the timestamp simply begins accruing from the first review after
--     this migration.
--   * Existing rows stay valid; no Capstone data is modified or deleted.
--   * Mirrors `submitted_at` in shape (timestamptz) and the repo's "additive, nullable, no backfill"
--     rule for lifecycle markers (same discipline as user_lesson_progress.deep_dive_opened_at).
--
-- Apply BEFORE deploying the code that writes these columns (standard ordering for additive columns
-- in this repo). Safe to leave applied on rollback of the Phase 8 code — the columns go unwritten.
-- No new tables, no analytics database, no destructive change.

ALTER TABLE public.capstone_submissions
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS reviewed_by uuid REFERENCES public.users(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.capstone_submissions.reviewed_at IS
  'Phase 8.2: first time an admin reviewed this submission (status → reviewed). NULL = not yet reviewed. Set once on the first review; preserved across later approve/reject changes so turnaround measures the first decision.';

COMMENT ON COLUMN public.capstone_submissions.reviewed_by IS
  'Phase 8.2: admin user id who first reviewed this submission. NULL = not yet reviewed. Set once alongside reviewed_at.';

-- Aging queries scan submissions still awaiting review, oldest-first. A partial index on the
-- unreviewed set keeps that bounded as submission volume grows (Phase 7 increases it).
CREATE INDEX IF NOT EXISTS capstone_submissions_awaiting_review_idx
  ON public.capstone_submissions (submitted_at)
  WHERE reviewed_at IS NULL;
