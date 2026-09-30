-- Rollback for Phase 8.2 — capstone review loop lifecycle timestamp.
--
-- Drops the additive columns and the partial aging index. Safe because both columns are nullable
-- and carry no dependent constraints beyond the self-contained reviewed_by FK. No Capstone content,
-- status or submission data is affected.

DROP INDEX IF EXISTS public.capstone_submissions_awaiting_review_idx;

ALTER TABLE public.capstone_submissions
  DROP COLUMN IF EXISTS reviewed_by,
  DROP COLUMN IF EXISTS reviewed_at;
