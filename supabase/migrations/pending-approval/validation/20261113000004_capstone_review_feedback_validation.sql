-- Validation for 20261113000004: Capstone review scores, feedback, and revision history.
--
-- The SQL editor shows only the last result, so select one numbered step at a time and run the selection.
--
-- Query 1: READ-ONLY, safe on production. Verifies columns and constraints exist.
-- Query 2: READ-ONLY, safe on production. Verifies privileges on capstone_submissions.
-- Step 3: STAGING ONLY. Transaction test for constraints, rolled back immediately.

-- 1. Check columns exist
SELECT
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'capstone_submissions'
  AND column_name IN ('review_scores', 'review_feedback', 'revision_count', 'review_history')
ORDER BY column_name;

-- Check constraints exist
SELECT
  constraint_name,
  check_clause
FROM information_schema.check_constraints
WHERE constraint_name IN ('capstone_submissions_review_feedback_length', 'capstone_submissions_revision_count_check')
ORDER BY constraint_name;

-- 2. Check privileges
DO $$
DECLARE
  v_role text;
BEGIN
  FOREACH v_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF has_table_privilege(v_role, 'public.capstone_submissions', 'INSERT') THEN
      RAISE EXCEPTION '20261113000004 FAILED: % has INSERT on public.capstone_submissions', v_role;
    END IF;
    IF has_table_privilege(v_role, 'public.capstone_submissions', 'UPDATE') THEN
      RAISE EXCEPTION '20261113000004 FAILED: % has UPDATE on public.capstone_submissions', v_role;
    END IF;
    IF has_table_privilege(v_role, 'public.capstone_submissions', 'DELETE') THEN
      RAISE EXCEPTION '20261113000004 FAILED: % has DELETE on public.capstone_submissions', v_role;
    END IF;
    IF has_any_column_privilege(v_role, 'public.capstone_submissions', 'INSERT, UPDATE') THEN
      RAISE EXCEPTION '20261113000004 FAILED: % has column-level write grant on public.capstone_submissions', v_role;
    END IF;
  END LOOP;
END $$;

-- 3. STAGING ONLY: Transaction test for constraints
BEGIN;

DO $$
DECLARE
  v_test_sub_id uuid := gen_random_uuid();
  v_test_user_id uuid := gen_random_uuid();
BEGIN
  -- Insert dummy user and submission
  INSERT INTO auth.users (id, email, aud, role)
  VALUES (v_test_user_id, 'validation_test@example.com', 'authenticated', 'authenticated');

  INSERT INTO public.users (id, email, name)
  VALUES (v_test_user_id, 'validation_test@example.com', 'Validation Tester');

  INSERT INTO public.capstone_submissions (
    id, user_id, module_slug, content, status, is_public,
    review_scores, review_feedback, revision_count, review_history
  ) VALUES (
    v_test_sub_id, v_test_user_id, 'foundations', 'Test content', 'reviewed', false,
    '{"req_problem": 3, "req_jtbd": 2}'::jsonb,
    'Good start, please revise.',
    1,
    '[{"action": "request_changes", "scores": {"req_problem": 3, "req_jtbd": 2}, "feedback": "Good start, please revise."}]'::jsonb
  );

  -- Ensure feedback length constraint works
  BEGIN
    UPDATE public.capstone_submissions
    SET review_feedback = repeat('x', 4001)
    WHERE id = v_test_sub_id;
    RAISE EXCEPTION 'Expected feedback length constraint violation';
  EXCEPTION WHEN check_violation THEN
    NULL; -- Expected
  END;

  -- Ensure revision count check works
  BEGIN
    UPDATE public.capstone_submissions
    SET revision_count = -1
    WHERE id = v_test_sub_id;
    RAISE EXCEPTION 'Expected revision count constraint violation';
  EXCEPTION WHEN check_violation THEN
    NULL; -- Expected
  END;
END $$;

ROLLBACK;
