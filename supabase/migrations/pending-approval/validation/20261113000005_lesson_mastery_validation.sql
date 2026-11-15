-- Validation for 20261113000005: Lesson mastery threshold at 70 percent.
--
-- The SQL editor shows only the last result, so select one numbered step at a time and run the selection.
--
-- Query 1: READ-ONLY, safe on production. Verifies column best_score exists.
-- Query 2: READ-ONLY, safe on production. Verifies privileges on record_lesson_quiz_completion.
-- Step 3: STAGING ONLY. Transaction test for 70% threshold and no downgrade, rolled back immediately.

-- 1. Check best_score column exists
SELECT
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'user_lesson_progress'
  AND column_name = 'best_score';

-- 2. Check privileges on RPC
DO $$
DECLARE
  v_role text;
BEGIN
  FOREACH v_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF has_function_privilege(v_role, 'public.record_lesson_quiz_completion(uuid, text, integer, integer, integer, jsonb, integer, integer)', 'EXECUTE') THEN
      RAISE EXCEPTION '20261113000005 FAILED: % has EXECUTE on public.record_lesson_quiz_completion', v_role;
    END IF;
  END LOOP;

  IF NOT has_function_privilege('service_role', 'public.record_lesson_quiz_completion(uuid, text, integer, integer, integer, jsonb, integer, integer)', 'EXECUTE') THEN
    RAISE EXCEPTION '20261113000005 FAILED: service_role lacks EXECUTE on public.record_lesson_quiz_completion';
  END IF;
END $$;

-- 3. STAGING ONLY: Transaction test for threshold and no downgrade
BEGIN;

DO $$
DECLARE
  v_test_user_id uuid := gen_random_uuid();
  v_test_lesson_id text := 'validation-lesson-test';
  v_res jsonb;
  v_status text;
  v_best smallint;
BEGIN
  -- Insert dummy user
  INSERT INTO auth.users (id, email, aud, role)
  VALUES (v_test_user_id, 'mastery_val_test@example.com', 'authenticated', 'authenticated');

  INSERT INTO public.users (id, email, name)
  VALUES (v_test_user_id, 'mastery_val_test@example.com', 'Mastery Tester');

  -- Attempt 1: 60% (below 70%)
  v_res := public.record_lesson_quiz_completion(
    v_test_user_id,
    v_test_lesson_id,
    60,
    3,
    5,
    '[]'::jsonb
  );

  SELECT status, best_score INTO v_status, v_best
  FROM public.user_lesson_progress
  WHERE user_id = v_test_user_id AND lesson_id = v_test_lesson_id;

  IF v_status <> 'in_progress' OR v_best <> 60 THEN
    RAISE EXCEPTION 'Failed below-threshold test: status=%, best=%', v_status, v_best;
  END IF;

  -- Attempt 2: 80% (meets 70%)
  v_res := public.record_lesson_quiz_completion(
    v_test_user_id,
    v_test_lesson_id,
    80,
    4,
    5,
    '[]'::jsonb
  );

  SELECT status, best_score INTO v_status, v_best
  FROM public.user_lesson_progress
  WHERE user_id = v_test_user_id AND lesson_id = v_test_lesson_id;

  IF v_status <> 'completed' OR v_best <> 80 THEN
    RAISE EXCEPTION 'Failed passed threshold test: status=%, best=%', v_status, v_best;
  END IF;

  -- Attempt 3: 40% (retake lower score - MUST NOT DOWNGRADE)
  v_res := public.record_lesson_quiz_completion(
    v_test_user_id,
    v_test_lesson_id,
    40,
    2,
    5,
    '[]'::jsonb
  );

  SELECT status, best_score INTO v_status, v_best
  FROM public.user_lesson_progress
  WHERE user_id = v_test_user_id AND lesson_id = v_test_lesson_id;

  IF v_status <> 'completed' OR v_best <> 80 THEN
    RAISE EXCEPTION 'Failed no-downgrade test: status=%, best=%', v_status, v_best;
  END IF;
END $$;

ROLLBACK;
