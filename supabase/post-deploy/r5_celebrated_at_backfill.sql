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
--
-- deployed_at must carry an explicit UTC offset (`Z`, `+00`, `+05:30`); without one Postgres
-- reads it in the session time zone and the cutoff can be hours off. The guard below aborts
-- when the offset is missing, the time is in the future, or it is more than 24 hours old. It
-- runs in the same transaction as the UPDATE, so a refused value changes nothing even without
-- ON_ERROR_STOP. Re-runnable: a second run only stamps rows that are still uncelebrated.

BEGIN;

-- psql does not substitute variables inside a DO body, so hand the value over as a setting.
SELECT set_config('r5.deployed_at', :deployed_at, true);

DO $$
DECLARE
  v_raw text := btrim(current_setting('r5.deployed_at'));
  v_at timestamptz;
BEGIN
  IF v_raw !~* '[0-9]{2}:[0-9]{2}(:[0-9]{2}(\.[0-9]+)?)?\s*(z|[+-][0-9]{2}(:?[0-9]{2})?)$' THEN
    RAISE EXCEPTION 'deployed_at "%" needs a time and an explicit UTC offset, e.g. 2026-10-12T09:30:00Z', v_raw;
  END IF;
  v_at := v_raw::timestamptz;
  IF v_at > now() THEN
    RAISE EXCEPTION 'deployed_at % is in the future (now is %)', v_at, now();
  END IF;
  IF v_at < now() - interval '24 hours' THEN
    RAISE EXCEPTION 'deployed_at % is more than 24 hours old (now is %)', v_at, now();
  END IF;
END $$;

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

COMMIT;
