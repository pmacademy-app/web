-- Migration: 20260908000002_quota_key_utc.sql
-- Pins the daily email quota key to UTC on the SQL side.
--
-- The quota counter key (`email_sent_count_YYYY_MM_DD`) was computed with
-- `TO_CHAR(NOW(), 'YYYY_MM_DD')`, which resolves in the Postgres *session* timezone,
-- while the application read the same counter using `new Date().toISOString()`, which
-- is always UTC. Whenever the database session timezone is not UTC the two disagree
-- for the offset window every day.
--
-- Enforcement was never wrong: `increment_daily_email_quota()` computes the key once
-- and both increments and checks that same key, so the gate is internally consistent.
-- The failure mode is operator-facing — the count shown on the admin dashboard was
-- read from a different row than the one being written, so it could show a stale or
-- empty value while the real counter was at its limit. During an abuse event that is
-- precisely when the number needs to be trustworthy.
--
-- Policy: the quota day is the UTC day. The TypeScript side is
-- `apps/web/lib/notifications/daily-quota-key.ts`.
--
-- Note on rollout: on a non-UTC database this shifts which key is written. For the
-- remainder of the current UTC day the counter effectively restarts from zero, so the
-- day of deployment can allow up to one extra quota's worth of optional email. Critical
-- auth email bypasses the quota entirely and is unaffected. Deploy near 00:00 UTC to
-- minimise the overlap.

SET search_path TO public, extensions, auth;

CREATE OR REPLACE FUNCTION public.increment_daily_email_quota(p_limit int)
RETURNS boolean AS $$
DECLARE
  -- `NOW() AT TIME ZONE 'UTC'` converts the timestamptz to the UTC wall clock,
  -- independent of the session timezone.
  today_key text := 'email_sent_count_' || TO_CHAR((NOW() AT TIME ZONE 'UTC'), 'YYYY_MM_DD');
  updated_count int;
BEGIN
  INSERT INTO public.system_settings (key, value, updated_at)
  VALUES (today_key, jsonb_build_object('count', 1), NOW())
  ON CONFLICT (key) DO UPDATE
    SET value = jsonb_build_object('count', (public.system_settings.value->>'count')::int + 1),
        updated_at = NOW()
    WHERE (public.system_settings.value->>'count')::int < p_limit
  RETURNING (value->>'count')::int INTO updated_count;

  RETURN updated_count IS NOT NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.get_current_daily_email_count()
RETURNS int AS $$
DECLARE
  today_key text := 'email_sent_count_' || TO_CHAR((NOW() AT TIME ZONE 'UTC'), 'YYYY_MM_DD');
  current_count int := 0;
BEGIN
  SELECT (value->>'count')::int INTO current_count
  FROM public.system_settings
  WHERE key = today_key;

  RETURN COALESCE(current_count, 0);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

COMMENT ON FUNCTION public.increment_daily_email_quota(int) IS
  'Atomically increments and checks the daily optional-email quota. The quota day is the UTC day; see apps/web/lib/notifications/daily-quota-key.ts.';
COMMENT ON FUNCTION public.get_current_daily_email_count() IS
  'Reads the current UTC-day optional-email send count.';
