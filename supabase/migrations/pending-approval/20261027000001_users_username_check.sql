-- Phase 2 / T08 (CQ-24): one username rule, enforced by the database too.
--
-- HELD IN pending-approval/. The Supabase CLI does not read this folder, so nothing here runs on
-- merge. The owner applies it by hand in the Supabase SQL editor, AFTER running query 1 of
-- validation/20261027000001_users_username_check_validation.sql and getting zero rows.
--
-- Why: onboarding (app/onboarding/actions.ts) and Settings > Portfolio (lib/portfolio-db.ts) used
-- different username rules, and onboarding skipped the reserved-word list, so a learner could
-- claim `admin` or `dashboard` as a public handle. Both writers now call validateUsername
-- (apps/web/lib/portfolio.ts) and store the handle trimmed and lowercased. This CHECK mirrors that
-- rule so no other writer (a script, the SQL editor, a future route) can store a handle the app
-- would refuse:
--   * NULL is allowed (the handle is optional until the learner sets one);
--   * otherwise 3 to 30 characters from [a-z0-9_-] (lowercase, because both writers lowercase);
--   * and not one of the reserved words in validateUsername.
-- Keep the reserved list here in step with lib/portfolio.ts. A word added there and not here is
-- still refused by the app; a word added here and not there turns a validation message into a
-- database error, so change both together.
--
-- RISK, read before applying: a CHECK is re-evaluated on EVERY UPDATE of a row, whichever column
-- the UPDATE touches. A legacy row whose username breaks the rule would make every later write to
-- that row fail with 23514, including XP, streak and lesson-progress updates, which would silently
-- stop that learner's progress. So this script refuses to run while any such row exists (step 1
-- below raises and nothing is changed). Fix those rows first, as the validation file explains.
--
-- No new object is created, so there is nothing to REVOKE: the constraint has no privileges of
-- its own and applies to every role, service_role and postgres included.
--
-- Idempotent: the constraint is dropped if present and re-added, so re-running re-applies the
-- current definition. ADD CONSTRAINT scans public.users under an ACCESS EXCLUSIVE lock; the table
-- is small, so this is brief.

SET search_path = public, pg_temp;

-- 1. Refuse to run while any existing username breaks the rule.
DO $$
DECLARE
  v_bad integer;
BEGIN
  SELECT count(*) INTO v_bad
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
  );

  IF v_bad > 0 THEN
    RAISE EXCEPTION '% public.users row(s) have a username that breaks the new rule. Run query 1 of validation/20261027000001_users_username_check_validation.sql, fix those rows, then apply this migration again.', v_bad;
  END IF;
END $$;

-- 2. Add (or re-add) the constraint.
ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_username_format_check;

ALTER TABLE public.users
  ADD CONSTRAINT users_username_format_check CHECK (
    username IS NULL
    OR (
      username ~ '^[a-z0-9_-]{3,30}$'
      AND username <> ALL (ARRAY[
        'admin', 'api', 'app', 'settings', 'curriculum',
        'academy', 'login', 'signup', 'dashboard', 'capstones'
      ])
    )
  );

COMMENT ON CONSTRAINT users_username_format_check ON public.users IS
'CQ-24: username is NULL or 3-30 chars of [a-z0-9_-] and not reserved. Mirrors validateUsername in apps/web/lib/portfolio.ts (stored lowercase). Change both together.';

-- 3. Self-check: the constraint exists, is validated, and enforces the rule.
DO $$
DECLARE
  v_def text;
  v_validated boolean;
BEGIN
  SELECT pg_get_constraintdef(c.oid), c.convalidated
    INTO v_def, v_validated
  FROM pg_constraint c
  WHERE c.conrelid = 'public.users'::regclass
    AND c.conname = 'users_username_format_check'
    AND c.contype = 'c';

  IF v_def IS NULL THEN
    RAISE EXCEPTION 'users_username_format_check is missing on public.users.';
  END IF;
  IF NOT v_validated THEN
    RAISE EXCEPTION 'users_username_format_check exists but is NOT VALID.';
  END IF;
  IF position('^[a-z0-9_-]{3,30}$' in v_def) = 0
     OR position('capstones' in v_def) = 0
     OR position('admin' in v_def) = 0 THEN
    RAISE EXCEPTION 'users_username_format_check has an unexpected definition: %', v_def;
  END IF;
END $$;
