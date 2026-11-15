-- Rollback for 20261113000005: Lesson mastery threshold at 70 percent.
-- Reverts best_score column and restores previous record_lesson_quiz_completion RPC.

SET search_path = public, pg_temp;

-- 1. Restore previous record_lesson_quiz_completion RPC (unconditional completion)
CREATE OR REPLACE FUNCTION public.record_lesson_quiz_completion(
  p_user_id uuid,
  p_lesson_id text,
  p_score_percentage int,
  p_correct_count int,
  p_total_questions int,
  p_attempts jsonb,
  p_quiz_correct_xp_per_question int DEFAULT 10,
  p_quiz_perfect_bonus_xp int DEFAULT 20
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_progress record;
  v_already_awarded_xp int := 0;
  v_max_possible_xp int := 0;
  v_incremental_xp int := 0;
  v_perfect_bonus_xp int := 0;
  v_total_xp_awarded int := 0;
  v_is_first_attempt boolean := false;
  v_has_bonus boolean := false;
  v_current_attempts int := 0;
  v_prev_score int := 0;
  v_prev_xp int := 0;
  v_completed_at timestamptz;
  v_now timestamptz := clock_timestamp();
BEGIN
  -- 1. Insert individual quiz attempts
  IF p_attempts IS NOT NULL AND jsonb_array_length(p_attempts) > 0 THEN
    INSERT INTO public.quiz_attempts (user_id, lesson_id, question_id, selected_option, is_correct, attempted_at)
    SELECT
      p_user_id,
      p_lesson_id,
      (item->>'question_id')::text,
      (item->>'selected_option')::int,
      (item->>'is_correct')::boolean,
      v_now
    FROM jsonb_array_elements(p_attempts) AS item;
  END IF;

  -- 2. Fetch existing user_lesson_progress
  SELECT * INTO v_progress
  FROM public.user_lesson_progress
  WHERE user_id = p_user_id AND lesson_id = p_lesson_id
  FOR UPDATE;

  IF v_progress.user_id IS NOT NULL THEN
    v_current_attempts := coalesce(v_progress.quiz_attempts, 0);
    v_prev_score := coalesce(v_progress.quiz_score, 0);
    v_prev_xp := coalesce(v_progress.xp_earned, 0);
    v_completed_at := coalesce(v_progress.completed_at, v_now);
    v_is_first_attempt := (v_current_attempts = 0);
  ELSE
    v_current_attempts := 0;
    v_prev_score := 0;
    v_prev_xp := 0;
    v_completed_at := v_now;
    v_is_first_attempt := true;
  END IF;

  -- 3. Calculate incremental XP based on previously earned quiz_correct XP
  SELECT coalesce(sum(xp_amount), 0) INTO v_already_awarded_xp
  FROM public.xp_events
  WHERE user_id = p_user_id
    AND source_type = 'quiz_correct'
    AND source_id = p_lesson_id;

  v_max_possible_xp := p_correct_count * p_quiz_correct_xp_per_question;
  v_incremental_xp := greatest(0, v_max_possible_xp - v_already_awarded_xp);

  -- 4. Check perfect score bonus on first attempt
  IF v_is_first_attempt AND p_correct_count = p_total_questions AND p_total_questions > 0 THEN
    SELECT EXISTS (
      SELECT 1 FROM public.xp_events
      WHERE user_id = p_user_id
        AND source_type = 'quiz_bonus'
        AND source_id = p_lesson_id
    ) INTO v_has_bonus;

    IF NOT v_has_bonus THEN
      v_perfect_bonus_xp := p_quiz_perfect_bonus_xp;
    END IF;
  END IF;

  v_total_xp_awarded := v_incremental_xp + v_perfect_bonus_xp;

  -- 5. Upsert progress atomically
  INSERT INTO public.user_lesson_progress (
    user_id,
    lesson_id,
    status,
    quiz_score,
    quiz_attempts,
    xp_earned,
    completed_at
  ) VALUES (
    p_user_id,
    p_lesson_id,
    'completed',
    greatest(v_prev_score, p_score_percentage),
    v_current_attempts + 1,
    v_prev_xp + v_total_xp_awarded,
    v_completed_at
  )
  ON CONFLICT (user_id, lesson_id) DO UPDATE SET
    status = 'completed',
    quiz_score = greatest(user_lesson_progress.quiz_score, EXCLUDED.quiz_score),
    quiz_attempts = user_lesson_progress.quiz_attempts + 1,
    xp_earned = user_lesson_progress.xp_earned + v_total_xp_awarded,
    completed_at = coalesce(user_lesson_progress.completed_at, EXCLUDED.completed_at);

  -- 6. Insert incremental quiz XP if > 0
  IF v_incremental_xp > 0 THEN
    INSERT INTO public.xp_events (user_id, source_type, source_id, xp_amount, created_at)
    VALUES (p_user_id, 'quiz_correct', p_lesson_id, v_incremental_xp, v_now);
  END IF;

  -- 7. Insert perfect score bonus if applicable
  IF v_perfect_bonus_xp > 0 THEN
    INSERT INTO public.xp_events (user_id, source_type, source_id, xp_amount, created_at)
    VALUES (p_user_id, 'quiz_bonus', p_lesson_id, v_perfect_bonus_xp, v_now)
    ON CONFLICT (user_id, source_type, source_id)
    WHERE source_id IS NOT NULL AND source_type IN ('theory_read', 'quiz_bonus', 'reflection', 'streak', 'referral', 'capstone')
    DO NOTHING;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'completed_at', v_completed_at,
    'quiz_attempts', v_current_attempts + 1,
    'quiz_score', greatest(v_prev_score, p_score_percentage),
    'xp_earned', v_prev_xp + v_total_xp_awarded,
    'incremental_xp', v_incremental_xp,
    'perfect_bonus_xp', v_perfect_bonus_xp,
    'total_xp_awarded', v_total_xp_awarded,
    'is_first_attempt', v_is_first_attempt
  );
END;
$$;

REVOKE ALL ON FUNCTION public.record_lesson_quiz_completion(uuid, text, int, int, int, jsonb, int, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_lesson_quiz_completion(uuid, text, int, int, int, jsonb, int, int) TO service_role;

-- 2. Drop best_score column
ALTER TABLE public.user_lesson_progress
  DROP COLUMN IF EXISTS best_score;
