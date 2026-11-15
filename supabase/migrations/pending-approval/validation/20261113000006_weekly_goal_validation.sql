-- Validation for 20261113000006: Learner weekly goal and session minutes.
--
-- The SQL editor shows only the last result, so select one numbered step at a time and run the selection.
--
-- Query 1: READ-ONLY, safe on production. Verifies columns exist.
-- Query 2: READ-ONLY, safe on production. Verifies check constraints.
-- Step 3: STAGING ONLY. Transaction test for constraints, rolled back immediately.

-- 1. Check columns exist
SELECT
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'users'
  AND column_name IN ('weekly_goal_lessons', 'session_minutes')
ORDER BY column_name;

-- 2. Check constraints exist
SELECT
  constraint_name,
  check_clause
FROM information_schema.check_constraints
WHERE constraint_name IN ('users_weekly_goal_lessons_check', 'users_session_minutes_check')
ORDER BY constraint_name;

-- 3. STAGING ONLY: Transaction test for constraints
BEGIN;

DO $$
DECLARE
  v_test_user_id uuid := gen_random_uuid();
BEGIN
  -- Insert user with valid goals
  INSERT INTO public.users (id, email, name, weekly_goal_lessons, session_minutes)
  VALUES (v_test_user_id, 'goal_val_test@example.com', 'Goal Tester', 3, 20);

  -- Ensure out-of-range weekly_goal_lessons fails
  BEGIN
    UPDATE public.users
    SET weekly_goal_lessons = 8
    WHERE id = v_test_user_id;
    RAISE EXCEPTION 'Expected weekly_goal_lessons constraint violation';
  EXCEPTION WHEN check_violation THEN
    NULL; -- Expected
  END;

  -- Ensure invalid session_minutes fails
  BEGIN
    UPDATE public.users
    SET session_minutes = 25
    WHERE id = v_test_user_id;
    RAISE EXCEPTION 'Expected session_minutes constraint violation';
  EXCEPTION WHEN check_violation THEN
    NULL; -- Expected
  END;
END $$;

ROLLBACK;
