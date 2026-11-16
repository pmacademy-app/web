-- AG-26 / PROD-03: Capstone rubric scores, written feedback and resubmission.
--
-- HELD IN pending-approval/. The Supabase CLI does not read this folder, so nothing
-- here runs on merge. The owner applies it by hand in the Supabase SQL editor.
--
-- Why: Capstone review previously recorded only approval or rejection without structured
-- scoring or written feedback, and learners could not revise and resubmit. This migration
-- adds columns to store rubric scores, feedback, revision counts, and review history.
--
-- Columns added:
-- - review_scores: JSONB map of requirement id to integer score (0..3).
-- - review_feedback: TEXT with check constraint capping length at 4000 characters.
-- - revision_count: INT NOT NULL DEFAULT 0 with check constraint >= 0.
-- - review_history: JSONB array preserving past review records across resubmissions.
--
-- Privileges: Writes remain restricted to service-role only. The existing SELECT policy
-- allows learners to read their own submission rows including the new review columns.
--
-- Rollback: rollback/20261113000004_capstone_review_feedback.down.sql
-- Validation: validation/20261113000004_capstone_review_feedback_validation.sql

SET search_path = public, pg_temp;

ALTER TABLE public.capstone_submissions
  ADD COLUMN IF NOT EXISTS review_scores jsonb,
  ADD COLUMN IF NOT EXISTS review_feedback text,
  ADD COLUMN IF NOT EXISTS revision_count int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS review_history jsonb;

COMMENT ON COLUMN public.capstone_submissions.review_scores IS
  'AG-26 (PROD-03): Rubric scores mapping requirement IDs to integer scores 0..3.';

COMMENT ON COLUMN public.capstone_submissions.review_feedback IS
  'AG-26 (PROD-03): Written feedback from reviewer. Up to 4000 characters.';

COMMENT ON COLUMN public.capstone_submissions.revision_count IS
  'AG-26 (PROD-03): Number of times learner has resubmitted after changes requested or rejection.';

COMMENT ON COLUMN public.capstone_submissions.review_history IS
  'AG-26 (PROD-03): Array of historical reviews preserving scores, feedback, actions and timestamps across revisions.';

-- Constraints
ALTER TABLE public.capstone_submissions DROP CONSTRAINT IF EXISTS capstone_submissions_review_feedback_length;
ALTER TABLE public.capstone_submissions ADD CONSTRAINT capstone_submissions_review_feedback_length CHECK (review_feedback IS NULL OR length(review_feedback) <= 4000);

ALTER TABLE public.capstone_submissions DROP CONSTRAINT IF EXISTS capstone_submissions_revision_count_check;
ALTER TABLE public.capstone_submissions ADD CONSTRAINT capstone_submissions_revision_count_check CHECK (revision_count >= 0);

-- Privilege reassurance: ensure anon and authenticated cannot write new columns.
REVOKE INSERT, UPDATE, DELETE ON public.capstone_submissions FROM PUBLIC, anon, authenticated;
