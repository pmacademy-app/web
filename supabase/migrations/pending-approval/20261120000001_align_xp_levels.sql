-- Align the stored XP level with the app's level thresholds.
--
-- The database set users.level at one level per 500 XP, while the app's
-- LEVEL_THRESHOLDS (apps/web/lib/xp/xp.ts) use 0 / 250 / 750 / 1500 / 2750 / 4500 /
-- 7000 / 10000 / 14000. The top bar and leaderboard read the stored level and the
-- level-up notification uses the app's, so learners saw two different levels
-- (for example 250 XP: app level 2, database level 1).
--
-- This makes the app's thresholds the single source of truth in SQL:
--   1. public.xp_level_for_total(int): the thresholds, in one place.
--   2. The three functions that write users.level call it.
--   3. Existing rows are recomputed once.
--
-- lib/__tests__/xp-level-sql-parity.test.ts fails if the thresholds here and in
-- xp.ts drift apart. Additive and re-runnable. Rollback restores the 500 XP formula.

SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION public.xp_level_for_total(p_total int)
RETURNS int
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = public, pg_temp
AS $$
  SELECT CASE
    WHEN coalesce(p_total, 0) >= 14000 THEN 9
    WHEN coalesce(p_total, 0) >= 10000 THEN 8
    WHEN coalesce(p_total, 0) >= 7000  THEN 7
    WHEN coalesce(p_total, 0) >= 4500  THEN 6
    WHEN coalesce(p_total, 0) >= 2750  THEN 5
    WHEN coalesce(p_total, 0) >= 1500  THEN 4
    WHEN coalesce(p_total, 0) >= 750   THEN 3
    WHEN coalesce(p_total, 0) >= 250   THEN 2
    ELSE 1
  END
$$;

REVOKE ALL ON FUNCTION public.xp_level_for_total(int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.xp_level_for_total(int) TO service_role;

CREATE OR REPLACE FUNCTION public.update_user_xp_and_level()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_target_user_id uuid;
  v_new_total int;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_target_user_id := OLD.user_id;
  ELSE
    v_target_user_id := NEW.user_id;
  END IF;

  SELECT coalesce(sum(xp_amount), 0) INTO v_new_total
  FROM public.xp_events
  WHERE user_id = v_target_user_id;

  UPDATE public.users
  SET total_xp = v_new_total,
      level = public.xp_level_for_total(v_new_total)
  WHERE id = v_target_user_id;

  IF TG_OP = 'UPDATE' AND OLD.user_id IS DISTINCT FROM NEW.user_id THEN
    SELECT coalesce(sum(xp_amount), 0) INTO v_new_total
    FROM public.xp_events
    WHERE user_id = OLD.user_id;
    UPDATE public.users
    SET total_xp = v_new_total,
        level = public.xp_level_for_total(v_new_total)
    WHERE id = OLD.user_id;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_user_xp_and_level_on_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actual_xp int;
BEGIN
  IF pg_trigger_depth() > 1 THEN
    RETURN NEW;
  END IF;

  IF (OLD.total_xp IS NOT DISTINCT FROM NEW.total_xp) AND (OLD.level IS NOT DISTINCT FROM NEW.level) THEN
    RETURN NEW;
  END IF;

  SELECT coalesce(sum(xp_amount), 0) INTO v_actual_xp
  FROM public.xp_events
  WHERE user_id = NEW.id;

  NEW.total_xp := v_actual_xp;
  NEW.level := public.xp_level_for_total(v_actual_xp);

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_user_xp(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actual_xp int;
BEGIN
  SELECT coalesce(sum(xp_amount), 0) INTO v_actual_xp
  FROM public.xp_events
  WHERE user_id = p_user_id;

  UPDATE public.users
  SET total_xp = v_actual_xp,
      level = public.xp_level_for_total(v_actual_xp)
  WHERE id = p_user_id;
END;
$$;

-- One-off recompute. The BEFORE UPDATE trigger re-derives total_xp from the ledger
-- and sets the same level, so this is consistent even if total_xp had drifted.
UPDATE public.users
SET level = public.xp_level_for_total(total_xp)
WHERE level IS DISTINCT FROM public.xp_level_for_total(total_xp);
