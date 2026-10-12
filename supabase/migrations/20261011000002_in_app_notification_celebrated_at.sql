-- Growth R5 / P2 — a celebration is separate from reading a notification.
--
-- The achievement celebration used to be claimed by compare-and-set on is_read, so a learner who
-- opened the notification bell first (marking the row read) never saw the celebration. The claim
-- now compare-and-sets this column instead; reading in the bell leaves it NULL.
--
-- Backfill: every achievement row that is already read is treated as celebrated, because an old
-- celebration claim and an old bell read both just set is_read and cannot be told apart. That
-- avoids re-celebrating anything; the new behaviour applies to reads from now on.

ALTER TABLE public.in_app_notifications
  ADD COLUMN IF NOT EXISTS celebrated_at timestamptz;

UPDATE public.in_app_notifications
SET celebrated_at = coalesce(read_at, created_at)
WHERE is_read = true
  AND celebrated_at IS NULL
  AND (
    idempotency_key LIKE 'certificate-generated-%'
    OR idempotency_key LIKE 'capstone-reviewed-%'
    OR idempotency_key LIKE 'fellow-granted-%'
    OR idempotency_key LIKE 'module-completed-%'
  );

-- The claim reads a learner's uncelebrated achievement rows. The predicate is wider than that:
-- it covers every uncelebrated row that has an idempotency key, of any notification type, since
-- only achievement rows are ever stamped. The index is ordered per learner, not achievement-only.
CREATE INDEX IF NOT EXISTS in_app_notifications_uncelebrated_idx
  ON public.in_app_notifications (user_id, created_at)
  WHERE celebrated_at IS NULL AND idempotency_key IS NOT NULL;

COMMENT ON COLUMN public.in_app_notifications.celebrated_at IS
'When the achievement celebration for this row was shown (claimed). Independent of is_read.';
