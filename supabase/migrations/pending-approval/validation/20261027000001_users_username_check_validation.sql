-- Validation for 20261027000001: users.username format CHECK.
--
-- The SQL editor shows only the last result, so select one numbered step at a time and run the
-- selection.
--
--   Query 1  READ-ONLY, safe on production. Run it BEFORE applying the migration. It lists every
--            row whose username the new CHECK would reject. It must return zero rows before you
--            apply: a CHECK is re-evaluated on every UPDATE of a row, so a row left in this list
--            would fail every later write (XP, streak, lesson progress) for that learner.
--   Query 2  READ-ONLY, safe on production. Run it AFTER applying. Confirms the constraint is
--            present and validated.
--   Step 3   STAGING ONLY. A transaction that tries bad handles and ends with ROLLBACK, so it
--            leaves nothing behind.

-- 1. PRE-CHECK (run first). Rows the CHECK would reject, with the reason.
SELECT
  id,
  username,
  CASE
    WHEN username <> lower(username) THEN 'has uppercase'
    WHEN length(username) < 3 OR length(username) > 30 THEN 'length ' || length(username)
    WHEN username !~ '^[a-z0-9_-]+$' THEN 'character outside [a-z0-9_-]'
    ELSE 'reserved word'
  END AS reason
FROM public.users
WHERE NOT (
  username IS NULL
  OR (
    username ~ '^[a-z0-9_-]{3,30}$'
    AND username <> ALL (ARRAY[
      'admin', 'api', 'app', 'settings', 'curriculum',
      'academy', 'login', 'signup', 'dashboard', 'capstones'
    ])
  )
)
ORDER BY id;

-- If query 1 returns rows, fix each one before applying, then run query 1 again until it is empty.
-- Pick per row:
--   * Uppercase only, and the lowercase form is free: set it to lower(username).
--       (check first: SELECT id FROM public.users WHERE username = lower('<the username>');)
--   * Anything else: clear the handle. The learner keeps their account and progress and picks a
--     new handle in Settings > Portfolio; their public /p/<handle> link stops working until then.
--       UPDATE public.users SET username = NULL WHERE id = '<uuid>';
-- Do not commit real ids or handles back to the repository.

-- 2. POST-CHECK (after applying). One row, validated = true.
SELECT
  conname,
  convalidated AS validated,
  pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conrelid = 'public.users'::regclass
  AND conname = 'users_username_format_check';

-- 3. STAGING ONLY. Bad handles are rejected with 23514; a good one and NULL are accepted.
--    Usage: psql "$STAGING_DB_URL" -v ON_ERROR_STOP=1 -f <this file>, or select from BEGIN to
--    ROLLBACK in the staging SQL editor. Success prints "20261027000001 validation passed".
BEGIN;

DO $$
DECLARE
  v_uid uuid;
  v_bad text;
BEGIN
  SELECT id INTO v_uid FROM public.users ORDER BY created_at LIMIT 1;
  IF v_uid IS NULL THEN
    RAISE EXCEPTION '20261027000001 validation needs at least one public.users row on staging.';
  END IF;

  FOREACH v_bad IN ARRAY ARRAY[
    'admin', 'dashboard', 'capstones', 'ab', repeat('a', 31), 'Ada', 'ada lovelace', 'ada.l', 'ada@pm'
  ] LOOP
    BEGIN
      UPDATE public.users SET username = v_bad WHERE id = v_uid;
      RAISE EXCEPTION '20261027000001 FAILED: username % was accepted', v_bad;
    EXCEPTION WHEN check_violation THEN
      NULL; -- expected
    END;
  END LOOP;

  -- Accepted: a valid handle (unique by construction) and NULL.
  UPDATE public.users SET username = 'cq24_' || substr(md5(v_uid::text), 1, 20) WHERE id = v_uid;
  UPDATE public.users SET username = 'a-b_' || substr(md5(v_uid::text), 1, 8) WHERE id = v_uid;
  UPDATE public.users SET username = NULL WHERE id = v_uid;

  RAISE NOTICE '20261027000001 validation passed';
END $$;

ROLLBACK;
