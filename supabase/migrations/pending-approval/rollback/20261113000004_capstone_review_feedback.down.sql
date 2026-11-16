-- Rollback for 20261113000004: Capstone review scores, feedback, and revision history.

SET search_path = public, pg_temp;

ALTER TABLE public.capstone_submissions
  DROP CONSTRAINT IF EXISTS capstone_submissions_review_feedback_length,
  DROP CONSTRAINT IF EXISTS capstone_submissions_revision_count_check,
  DROP COLUMN IF EXISTS review_scores,
  DROP COLUMN IF EXISTS review_feedback,
  DROP COLUMN IF EXISTS revision_count,
  DROP COLUMN IF EXISTS review_history;
