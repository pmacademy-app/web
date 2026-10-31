-- Staging validation for 20261024000001: product_events table and measurement views.
--
-- STAGING ONLY. Runs inside one transaction and rolls back, so it leaves no rows behind, but it
-- impersonates the `authenticated` and `anon` roles and must not be pointed at production.
--
-- Usage (after applying 20261024000001_product_events.sql on staging):
--   psql "$STAGING_DB_URL" -v ON_ERROR_STOP=1 -v user_id="'<an existing learner uuid>'" \
--     -f supabase/migrations/validation/20261024000001_product_events_validation.sql
--
-- Every check raises on failure. Success prints "20261024000001 validation passed".

BEGIN;

-- 1. Shape: RLS on, no policies, no end-user privileges on the table or either view.
DO $$
DECLARE
  v_rel text;
  v_role text;
BEGIN
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.product_events'::regclass) THEN
    RAISE EXCEPTION '20261024000001 FAILED: RLS is not enabled on product_events';
  END IF;

  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'product_events') THEN
    RAISE EXCEPTION '20261024000001 FAILED: product_events has a policy; it must have none';
  END IF;

  FOREACH v_rel IN ARRAY ARRAY['public.product_events', 'public.weekly_mastering_learners', 'public.weekly_cohort_retention'] LOOP
    FOREACH v_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
      IF has_table_privilege(v_role, v_rel, 'SELECT')
         OR has_table_privilege(v_role, v_rel, 'INSERT')
         OR has_table_privilege(v_role, v_rel, 'UPDATE')
         OR has_table_privilege(v_role, v_rel, 'DELETE') THEN
        RAISE EXCEPTION '20261024000001 FAILED: % holds a privilege on %', v_role, v_rel;
      END IF;
    END LOOP;
  END LOOP;
END
$$;

-- 2. As a learner, reading or writing the table is refused.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', :user_id, 'role', 'authenticated')::text, true);

DO $$
BEGIN
  BEGIN
    INSERT INTO public.product_events (user_id, event_name)
    VALUES ((current_setting('request.jwt.claims')::json ->> 'sub')::uuid, 'signup');
    RAISE EXCEPTION '20261024000001 FAILED: learner could insert a product event';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  BEGIN
    PERFORM 1 FROM public.weekly_mastering_learners;
    RAISE EXCEPTION '20261024000001 FAILED: learner could read weekly_mastering_learners';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END
$$;

RESET ROLE;

-- 3. As the service role, the CHECKs hold and the north-star view counts the right rows.
SET LOCAL ROLE service_role;
SELECT set_config('pe.user_id', :user_id, true);

DO $$
DECLARE
  v_uid uuid := current_setting('pe.user_id')::uuid;
  v_week date := date_trunc('week', now() AT TIME ZONE 'UTC')::date;
  v_before bigint;
  v_after bigint;
BEGIN
  BEGIN
    INSERT INTO public.product_events (user_id, event_name) VALUES (v_uid, 'not_a_real_event');
    RAISE EXCEPTION '20261024000001 FAILED: unknown event_name was accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  BEGIN
    INSERT INTO public.product_events (user_id, event_name, properties) VALUES (v_uid, 'signup', '[]'::jsonb);
    RAISE EXCEPTION '20261024000001 FAILED: non-object properties were accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  -- Clear this learner's events for the week inside the transaction so the count is exact.
  DELETE FROM public.product_events WHERE user_id = v_uid;
  SELECT coalesce(max(mastering_learners), 0) INTO v_before
    FROM public.weekly_mastering_learners WHERE week_start = v_week;

  -- A low score and a non-numeric score do not count.
  INSERT INTO public.product_events (user_id, event_name, properties)
  VALUES (v_uid, 'lesson_completed', '{"score": 40}'::jsonb),
         (v_uid, 'lesson_completed', '{"score": "high"}'::jsonb);
  SELECT coalesce(max(mastering_learners), 0) INTO v_after
    FROM public.weekly_mastering_learners WHERE week_start = v_week;
  IF v_after <> v_before THEN
    RAISE EXCEPTION '20261024000001 FAILED: a score below 70 or a non-numeric score counted';
  END IF;

  -- A passing score counts the learner once, however many events they have.
  INSERT INTO public.product_events (user_id, event_name, properties)
  VALUES (v_uid, 'lesson_completed', '{"score": 70}'::jsonb),
         (v_uid, 'capstone_submitted', '{}'::jsonb);
  SELECT coalesce(max(mastering_learners), 0) INTO v_after
    FROM public.weekly_mastering_learners WHERE week_start = v_week;
  IF v_after <> v_before + 1 THEN
    RAISE EXCEPTION '20261024000001 FAILED: expected % mastering learners, got %', v_before + 1, v_after;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.weekly_cohort_retention WHERE active_week = v_week AND active_learners >= 1
  ) THEN
    RAISE EXCEPTION '20261024000001 FAILED: weekly_cohort_retention has no row for this week';
  END IF;
END
$$;

RESET ROLE;

SELECT '20261024000001 validation passed' AS result;

ROLLBACK;
