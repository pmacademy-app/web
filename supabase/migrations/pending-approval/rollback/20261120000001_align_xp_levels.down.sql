-- Rollback for 20261120000001: restore the 500 XP per level formula.
--
-- Re-creates the three level-writing functions as they were in 20260925000002 (with the
-- search_path pin from 20261018000001), recomputes users.level with the old formula and
-- drops the helper. Re-runnable.

SET search_path = public, pg_temp;

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
      level = least(9, greatest(1, floor(v_new_total / 500) + 1))
  WHERE id = v_target_user_id;

  IF TG_OP = 'UPDATE' AND OLD.user_id IS DISTINCT FROM NEW.user_id THEN
    SELECT coalesce(sum(xp_amount), 0) INTO v_new_total
    FROM public.xp_events
    WHERE user_id = OLD.user_id;
    UPDATE public.users
    SET total_xp = v_new_total,
        level = least(9, greatest(1, floor(v_new_total / 500) + 1))
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
  NEW.level := least(9, greatest(1, floor(v_actual_xp / 500) + 1));

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
      level = least(9, greatest(1, floor(v_actual_xp / 500) + 1))
  WHERE id = p_user_id;
END;
$$;

UPDATE public.users
SET level = least(9, greatest(1, floor(total_xp / 500) + 1))
WHERE level IS DISTINCT FROM least(9, greatest(1, floor(total_xp / 500) + 1));

DROP FUNCTION IF EXISTS public.xp_level_for_total(int);
