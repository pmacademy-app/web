-- Growth R5 / P2 — post-deploy backfill for in_app_notifications.celebrated_at.
--
-- Run ONCE, right after the R5 app code is live everywhere (see docs/releases/growth-r5-deploy.md).
--
-- Why: migration 20261011000002 backfills celebrated_at when it is applied, but app instances
-- running the previous code keep claiming celebrations by setting is_read only, until the new
-- code replaces them. A celebration claimed in that window would be read but uncelebrated, and
-- the new code would show it a second time. This re-runs the same backfill for rows read before
-- the moment the new code went live.
--
-- Rows read AFTER that moment are left alone on purpose: under the new code a bell read must not
-- use up the celebration.
--
-- Usage:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
--     -v deployed_at="'2026-10-12T09:30:00Z'" \
--     -f supabase/post-deploy/r5_celebrated_at_backfill.sql

UPDATE public.in_app_notifications
SET celebrated_at = coalesce(read_at, created_at)
WHERE is_read = true
  AND celebrated_at IS NULL
  AND coalesce(read_at, created_at) < :deployed_at::timestamptz
  AND (
    idempotency_key LIKE 'certificate-generated-%'
    OR idempotency_key LIKE 'capstone-reviewed-%'
    OR idempotency_key LIKE 'fellow-granted-%'
    OR idempotency_key LIKE 'module-completed-%'
  );
