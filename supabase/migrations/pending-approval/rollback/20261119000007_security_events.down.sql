-- Rollback for 20261119000007: security event counters and daily digests.
--
-- Drops public.record_security_event and both tables. Their rows are lost: the counters are
-- operational telemetry (30-day retention) and the digests are derived from them, so no export is
-- needed. Export public.security_digests first only if you want to keep past summaries.
--
-- The app does not need the rollback to keep working: apps/web/lib/security/security-events.ts
-- treats a missing function as "not applied yet" and stops calling it for 10 minutes at a time, and
-- the retention sweep skips both tables when they do not exist. Re-runnable.

SET search_path = public, pg_temp;

DROP FUNCTION IF EXISTS public.record_security_event(text, text, text, text, text, text);
DROP TABLE IF EXISTS public.security_digests;
DROP TABLE IF EXISTS public.security_event_counts;
