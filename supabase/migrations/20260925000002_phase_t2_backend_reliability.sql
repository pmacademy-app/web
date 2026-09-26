-- Prodily — Phase T2: Core Backend Reliability
-- Migration: 20260925000002_phase_t2_backend_reliability.sql
--
-- Fixes:
-- 1. T2.2: XP trigger performance & correctness (CRIT-05 / P1-1)
--    - Replaces unconditional full table scans on users UPDATE with scoped anti-tampering check
--    - Eliminates duplicate aggregation when xp_events triggers an UPDATE users
--    - Extends xp_events trigger to AFTER INSERT OR UPDATE OR DELETE for automatic ledger sync
-- 2. T2.3: Atomic Lesson Completion RPC
--    - Wraps quiz attempt recording, user lesson progress completion, and XP awarding in a single atomic transaction
--    - Guarantees all-or-nothing consistency across quiz_attempts, user_lesson_progress, and xp_events

SET search_path TO public, pg_temp;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. T2.2: XP Trigger Optimization & Ledger Synchronization
-- ─────────────────────────────────────────────────────────────────────────────

-- Authoritative synchronization function: updates user total_xp and level when xp_events change.
CREATE OR REPLACE FUNCTION public.update_user_xp_and_level()
RETURNS TRIGGER AS $$
DECLARE
  v_target_user_id uuid;
  v_new_total int;
  v_calculated_level int;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_target_user_id := OLD.user_id;
  ELSE
    v_target_user_id := NEW.user_id;
  END IF;

  SELECT coalesce(sum(xp_amount), 0) INTO v_new_total
  FROM public.xp_events
  WHERE user_id = v_target_user_id;

  -- 500 XP per level increment, capped at level 9
  v_calculated_level := least(9, greatest(1, floor(v_new_total / 500) + 1));

  UPDATE public.users
  SET total_xp = v_new_total,
      level = v_calculated_level
  WHERE id = v_target_user_id;

  -- If user_id was changed in an UPDATE, synchronize the previous user's total as well
  IF TG_OP = 'UPDATE' AND OLD.user_id IS DISTINCT FROM NEW.user_id THEN
    SELECT coalesce(sum(xp_amount), 0) INTO v_new_total
    FROM public.xp_events
    WHERE user_id = OLD.user_id;
    v_calculated_level := least(9, greatest(1, floor(v_new_total / 500) + 1));
    UPDATE public.users
    SET total_xp = v_new_total,
        level = v_calculated_level
    WHERE id = OLD.user_id;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Recreate trigger on xp_events for INSERT, UPDATE, and DELETE
DROP TRIGGER IF EXISTS trigger_update_user_xp ON public.xp_events;
CREATE TRIGGER trigger_update_user_xp
AFTER INSERT OR UPDATE OR DELETE ON public.xp_events
FOR EACH ROW
EXECUTE FUNCTION public.update_user_xp_and_level();

-- Anti-tampering Trigger on users:
-- Only recomputes total_xp/level if:
--   a) pg_trigger_depth() <= 1 (direct user table update, not initiated by xp_events trigger)
--   AND
--   b) total_xp or level was explicitly modified (tampering or manual re-sync)
-- Prevents redundant table scans on unrelated profile/streak updates.
CREATE OR REPLACE FUNCTION public.sync_user_xp_and_level_on_update()
RETURNS TRIGGER AS $$
DECLARE
  v_actual_xp int;
  v_calculated_level int;
BEGIN
  -- If update was triggered from an xp_events trigger (depth > 1), the values in NEW are already authentic.
  IF pg_trigger_depth() > 1 THEN
    RETURN NEW;
  END IF;

  -- If neither total_xp nor level was touched, this is an unrelated profile update (name, streak, etc.). Skip scan.
  IF (OLD.total_xp IS NOT DISTINCT FROM NEW.total_xp) AND (OLD.level IS NOT DISTINCT FROM NEW.level) THEN
    RETURN NEW;
  END IF;

  -- Recalculate authentic total_xp from the ledger to prevent direct client tampering
  SELECT coalesce(sum(xp_amount), 0) INTO v_actual_xp
  FROM public.xp_events
  WHERE user_id = NEW.id;

  v_calculated_level := least(9, greatest(1, floor(v_actual_xp / 500) + 1));

  NEW.total_xp := v_actual_xp;
  NEW.level := v_calculated_level;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_sync_user_xp_on_update ON public.users;
CREATE TRIGGER trigger_sync_user_xp_on_update
BEFORE UPDATE ON public.users
FOR EACH ROW
EXECUTE FUNCTION public.sync_user_xp_and_level_on_update();

-- Explicit synchronization helper for maintenance operations
CREATE OR REPLACE FUNCTION public.sync_user_xp(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_actual_xp int;
  v_calculated_level int;
BEGIN
  SELECT coalesce(sum(xp_amount), 0) INTO v_actual_xp
  FROM public.xp_events
  WHERE user_id = p_user_id;

  v_calculated_level := least(9, greatest(1, floor(v_actual_xp / 500) + 1));

  UPDATE public.users
  SET total_xp = v_actual_xp,
      level = v_calculated_level
  WHERE id = p_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.sync_user_xp(uuid) TO authenticated, service_role;


-- ─────────────────────────────────────────────────────────────────────────────
-- 2. T2.3: Atomic Lesson Completion RPC
-- ─────────────────────────────────────────────────────────────────────────────

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

GRANT EXECUTE ON FUNCTION public.record_lesson_quiz_completion TO authenticated, service_role;
