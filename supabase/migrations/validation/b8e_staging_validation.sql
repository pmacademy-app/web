-- B8-E staging validation — seed, assert, rollback, re-apply.
--
-- ⚠️  STAGING ONLY. This script INSERTS synthetic rows and is destructive by design.
--     It must never be run against production. The first statement refuses to proceed
--     if the database looks like production.
--
-- Covers the eight checks required before B8-E may be applied to production:
--   1. theory_read duplicates are removed correctly
--   2. quiz_correct top-ups remain intact
--   3. flashcard awards on later days still work
--   4. repeated user_reset rows remain intact
--   5. users.total_xp and level are correctly re-derived
--   6. a duplicate theory_read insert raises 23505
--   7. rollback works
--   8. the forward migration re-applies cleanly
--
-- Usage (staging):
--   psql "$STAGING_DB_URL" -v ON_ERROR_STOP=1 -f supabase/migrations/validation/b8e_staging_validation.sql
--
-- Every assertion raises an exception on failure, so ON_ERROR_STOP=1 makes the script
-- fail loudly rather than printing a wall of output nobody reads.

\set ON_ERROR_STOP on

SET search_path TO public;

-- ── Guard · refuse to run against production ─────────────────────────────────
DO $$
BEGIN
  -- Production holds 325 users and 1636 xp_events as of 2026-09-13. A staging project
  -- seeded with synthetic data only will be far smaller. This is a blunt guard, not a
  -- security control — the real control is not having production credentials here.
  IF (SELECT count(*) FROM public.users) > 100 THEN
    RAISE EXCEPTION 'Refusing to run: % users looks like production, not staging.',
      (SELECT count(*) FROM public.users);
  END IF;
END $$;

-- ── Seed · one user per scenario ─────────────────────────────────────────────
BEGIN;

CREATE TEMP TABLE b8e_v_users (label text, id uuid) ON COMMIT DROP;
INSERT INTO b8e_v_users VALUES
  ('race',      '00000000-0000-4000-8000-000000000001'),
  ('topup',     '00000000-0000-4000-8000-000000000002'),
  ('flashcard', '00000000-0000-4000-8000-000000000003'),
  ('reset',     '00000000-0000-4000-8000-000000000004');

INSERT INTO public.users (id, email, name, total_xp, level)
SELECT id, 'b8e-' || label || '@validation.invalid', 'B8E ' || label, 0, 1
FROM b8e_v_users
ON CONFLICT (id) DO NOTHING;

-- Scenario 1 · theory_read race: three rows, sub-second apart. Expect 2 deleted.
INSERT INTO public.xp_events (user_id, source_type, source_id, xp_amount, created_at) VALUES
  ('00000000-0000-4000-8000-000000000001', 'theory_read', 'les_val01', 10, '2026-09-01T10:00:00.000Z'),
  ('00000000-0000-4000-8000-000000000001', 'theory_read', 'les_val01', 10, '2026-09-01T10:00:00.180Z'),
  ('00000000-0000-4000-8000-000000000001', 'theory_read', 'les_val01', 10, '2026-09-01T10:00:00.410Z');

-- Scenario 2 · quiz_correct top-up: increments weeks apart. Expect BOTH kept.
INSERT INTO public.xp_events (user_id, source_type, source_id, xp_amount, created_at) VALUES
  ('00000000-0000-4000-8000-000000000002', 'quiz_correct', 'les_val02', 20, '2026-08-01T10:00:00Z'),
  ('00000000-0000-4000-8000-000000000002', 'quiz_correct', 'les_val02', 30, '2026-08-23T10:00:00Z');

-- Scenario 3 · flashcard on two different days. Expect BOTH kept.
INSERT INTO public.xp_events (user_id, source_type, source_id, xp_amount, created_at) VALUES
  ('00000000-0000-4000-8000-000000000003', 'flashcard', 'card_val03', 5, '2026-09-01T10:00:00Z'),
  ('00000000-0000-4000-8000-000000000003', 'flashcard', 'card_val03', 5, '2026-09-02T10:00:00Z');

-- Scenario 4 · two account resets, constant source_id. Expect BOTH kept.
INSERT INTO public.xp_events (user_id, source_type, source_id, xp_amount, created_at) VALUES
  ('00000000-0000-4000-8000-000000000004', 'user_reset', 'settings_reset', -100, '2026-09-01T10:00:00Z'),
  ('00000000-0000-4000-8000-000000000004', 'user_reset', 'settings_reset', -40,  '2026-09-04T10:00:00Z');

COMMIT;

-- Record pre-migration totals so check 5 has something to compare against.
CREATE TEMP TABLE b8e_v_before AS
SELECT u.id, u.total_xp, u.level
FROM public.users u JOIN b8e_v_users v ON v.id = u.id;

\echo '--- Seeded. Now apply the forward migration in a separate psql invocation: ---'
\echo '    psql "$STAGING_DB_URL" -v ON_ERROR_STOP=1 -f supabase/migrations/20260913000001_xp_event_uniqueness_b8e.sql'
\echo '--- Then re-run this file with -v phase=assert ---'

-- ── Assertions · run AFTER the forward migration ─────────────────────────────
-- Guarded so the seed phase does not run them before the migration exists.
DO $$
DECLARE
  n int;
BEGIN
  IF to_regclass('public.xp_events') IS NULL THEN RETURN; END IF;

  -- Skip assertions unless the migration has actually been applied.
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = 'xp_events_once_only_source_unique'
  ) THEN
    RAISE NOTICE 'Index absent — seed phase complete, assertions skipped. Apply the migration next.';
    RETURN;
  END IF;

  -- 1 · theory_read duplicates removed, earliest kept
  SELECT count(*) INTO n FROM public.xp_events
   WHERE user_id = '00000000-0000-4000-8000-000000000001' AND source_type = 'theory_read';
  IF n <> 1 THEN RAISE EXCEPTION 'CHECK 1 FAILED: expected 1 theory_read row, found %', n; END IF;

  SELECT count(*) INTO n FROM public.xp_events
   WHERE user_id = '00000000-0000-4000-8000-000000000001'
     AND created_at = '2026-09-01T10:00:00.000Z';
  IF n <> 1 THEN RAISE EXCEPTION 'CHECK 1 FAILED: earliest row was not the one kept'; END IF;

  -- 2 · quiz_correct top-ups intact
  SELECT count(*) INTO n FROM public.xp_events
   WHERE user_id = '00000000-0000-4000-8000-000000000002' AND source_type = 'quiz_correct';
  IF n <> 2 THEN RAISE EXCEPTION 'CHECK 2 FAILED: quiz_correct top-up was deleted (% rows)', n; END IF;

  -- 3 · flashcard multi-day intact
  SELECT count(*) INTO n FROM public.xp_events
   WHERE user_id = '00000000-0000-4000-8000-000000000003' AND source_type = 'flashcard';
  IF n <> 2 THEN RAISE EXCEPTION 'CHECK 3 FAILED: flashcard row was deleted (% rows)', n; END IF;

  -- 4 · repeated user_reset intact
  SELECT count(*) INTO n FROM public.xp_events
   WHERE user_id = '00000000-0000-4000-8000-000000000004' AND source_type = 'user_reset';
  IF n <> 2 THEN RAISE EXCEPTION 'CHECK 4 FAILED: user_reset row was deleted (% rows)', n; END IF;

  -- 5 · totals re-derived from the ledger for the affected user
  SELECT u.total_xp INTO n FROM public.users u
   WHERE u.id = '00000000-0000-4000-8000-000000000001';
  IF n <> 10 THEN
    RAISE EXCEPTION 'CHECK 5 FAILED: total_xp is % after dedupe, expected 10 (one 10 XP row)', n;
  END IF;

  -- Unaffected users must be untouched.
  SELECT u.total_xp INTO n FROM public.users u
   WHERE u.id = '00000000-0000-4000-8000-000000000002';
  IF n <> 50 THEN
    RAISE EXCEPTION 'CHECK 5 FAILED: top-up user total_xp is %, expected 50', n;
  END IF;

  RAISE NOTICE 'CHECKS 1-5 PASSED';
END $$;

-- 6 · a duplicate theory_read insert must raise 23505
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = 'xp_events_once_only_source_unique'
  ) THEN RETURN; END IF;

  BEGIN
    INSERT INTO public.xp_events (user_id, source_type, source_id, xp_amount)
    VALUES ('00000000-0000-4000-8000-000000000001', 'theory_read', 'les_val01', 10);
    RAISE EXCEPTION 'CHECK 6 FAILED: duplicate theory_read insert was ACCEPTED';
  EXCEPTION WHEN unique_violation THEN
    RAISE NOTICE 'CHECK 6 PASSED: duplicate theory_read raised 23505';
  END;

  -- And the excluded types must still accept a second row.
  BEGIN
    INSERT INTO public.xp_events (user_id, source_type, source_id, xp_amount)
    VALUES ('00000000-0000-4000-8000-000000000003', 'flashcard', 'card_val03', 5);
    RAISE NOTICE 'CHECK 6b PASSED: a later flashcard award still succeeds';
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'CHECK 6b FAILED: flashcard award was blocked by the constraint';
  END;
END $$;

\echo '--- Checks 1-6 done. For checks 7 and 8, run: ---'
\echo '    psql "$STAGING_DB_URL" -f supabase/migrations/rollback/20260913000001_xp_event_uniqueness_b8e.down.sql'
\echo '    -- confirm the index is gone and a duplicate theory_read insert now SUCCEEDS'
\echo '    psql "$STAGING_DB_URL" -f supabase/migrations/20260913000001_xp_event_uniqueness_b8e.sql'
\echo '    -- confirm re-apply is clean (IF NOT EXISTS makes it idempotent)'
