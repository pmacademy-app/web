-- Grant allowlist test for schema public (AG-04, plan PR-15).
--
-- Lists every object in schema public (tables, views, sequences, functions)
-- where anon or authenticated has any privilege. Compares against the
-- documented allowlist below and raises an exception on anything not listed.
-- Every learner-facing read or write must be justified by RLS.
--
-- Usage:
--   psql "$DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/grant_allowlist.sql

BEGIN;

DO $$
DECLARE
  v_unexpected text[] := ARRAY[]::text[];
  r record;
BEGIN
  -- Create temporary table to store the explicit grant allowlist
  CREATE TEMP TABLE public_grant_allowlist (
    grantee text NOT NULL,
    object_type text NOT NULL,
    object_name text NOT NULL,
    privilege_type text NOT NULL,
    justification text NOT NULL
  ) ON COMMIT DROP;

  -- 1. Tables and Views allowlist
  INSERT INTO public_grant_allowlist (grantee, object_type, object_name, privilege_type, justification) VALUES
    -- Users table: learners can read their own profile (RLS enforced)
    ('authenticated', 'TABLE', 'users', 'SELECT', 'Learner profile reads guarded by RLS; client writes revoked'),

    -- Certificates: learners can view their own certificates (RLS enforced)
    ('authenticated', 'TABLE', 'certificates', 'SELECT', 'Learner certificates viewed by owner via RLS'),

    -- In-app notifications: learners can read their own inbox notifications (RLS enforced)
    ('authenticated', 'TABLE', 'in_app_notifications', 'SELECT', 'Learner notifications inbox guarded by RLS'),

    -- Capstone submissions: learners can view their own submissions (RLS enforced)
    ('authenticated', 'TABLE', 'capstone_submissions', 'SELECT', 'Learner capstones viewed by owner via RLS; writes revoked'),

    -- Testimonials: public and learners can read published testimonials (RLS enforced)
    ('anon',          'TABLE', 'testimonials', 'SELECT', 'Public visitors view published testimonials via RLS'),
    ('authenticated', 'TABLE', 'testimonials', 'SELECT', 'Learners view published testimonials or own feedback via RLS'),

    -- User lesson progress: learners track and update their progress (RLS enforced)
    ('authenticated', 'TABLE', 'user_lesson_progress', 'SELECT', 'Learners view own progress via RLS'),
    ('authenticated', 'TABLE', 'user_lesson_progress', 'INSERT', 'Learners record progress via RLS'),
    ('authenticated', 'TABLE', 'user_lesson_progress', 'UPDATE', 'Learners update progress via RLS'),

    -- Quiz attempts: learners record interactive quiz attempts (RLS enforced)
    ('authenticated', 'TABLE', 'quiz_attempts', 'SELECT', 'Learners view own quiz attempts via RLS'),
    ('authenticated', 'TABLE', 'quiz_attempts', 'INSERT', 'Learners record quiz attempts via RLS'),

    -- Flashcards SRS: learners track spaced repetition reviews (RLS enforced)
    ('authenticated', 'TABLE', 'user_flashcard_srs', 'SELECT', 'Learners view own SRS queue via RLS'),
    ('authenticated', 'TABLE', 'user_flashcard_srs', 'INSERT', 'Learners create SRS records via RLS'),
    ('authenticated', 'TABLE', 'user_flashcard_srs', 'UPDATE', 'Learners update SM-2 memory intervals via RLS'),

    -- XP events: learners view their own XP activity history (RLS enforced)
    ('authenticated', 'TABLE', 'xp_events', 'SELECT', 'Learners view their own XP ledger via RLS'),

    -- Module feedback: learners submit feedback for modules (RLS enforced)
    ('authenticated', 'TABLE', 'module_feedback', 'SELECT', 'Learners view own module feedback via RLS'),
    ('authenticated', 'TABLE', 'module_feedback', 'INSERT', 'Learners submit module feedback via RLS'),

    -- Contact messages: learners can submit support messages
    ('authenticated', 'TABLE', 'contact_messages', 'INSERT', 'Learners submit support contact messages'),

    -- Referral attributions: learners view their referral rewards (RLS enforced)
    ('authenticated', 'TABLE', 'referral_attributions', 'SELECT', 'Learners view own referral stats via RLS'),

    -- Leaderboard snapshots: read-only rankings (RLS enforced)
    ('anon',          'TABLE', 'leaderboard_snapshots', 'SELECT', 'Public reads leaderboard snapshot rankings via RLS'),
    ('authenticated', 'TABLE', 'leaderboard_snapshots', 'SELECT', 'Learners read leaderboard snapshot rankings via RLS'),

    -- Public cohorts: read-only cohort list
    ('anon',          'TABLE', 'public_cohorts', 'SELECT', 'Public reads public cohort names'),
    ('authenticated', 'TABLE', 'public_cohorts', 'SELECT', 'Learners read public cohort names');

  -- 2. Column-level grants allowlist
  INSERT INTO public_grant_allowlist (grantee, object_type, object_name, privilege_type, justification) VALUES
    -- In-app notifications: learners can update read state columns (RLS enforced)
    ('authenticated', 'COLUMN', 'in_app_notifications.is_read', 'UPDATE', 'Learners mark own notification as read via RLS'),
    ('authenticated', 'COLUMN', 'in_app_notifications.read_at', 'UPDATE', 'Learners update notification read timestamp via RLS');

  -- Check actual Table and View grants in schema public
  FOR r IN
    SELECT g.grantee,
           'TABLE' AS object_type,
           g.table_name AS object_name,
           g.privilege_type
    FROM information_schema.role_table_grants g
    WHERE g.table_schema = 'public'
      AND g.grantee IN ('anon', 'authenticated')
      AND NOT EXISTS (
        SELECT 1 FROM public_grant_allowlist a
        WHERE a.grantee = g.grantee
          AND a.object_type = 'TABLE'
          AND a.object_name = g.table_name
          AND a.privilege_type = g.privilege_type
      )
  LOOP
    v_unexpected := v_unexpected || (r.grantee || ' on ' || r.object_type || ' ' || r.object_name || ' (' || r.privilege_type || ')');
  END LOOP;

  -- Check actual Column grants in schema public
  FOR r IN
    SELECT c.grantee,
           'COLUMN' AS object_type,
           (c.table_name || '.' || c.column_name) AS object_name,
           c.privilege_type
    FROM information_schema.column_privileges c
    WHERE c.table_schema = 'public'
      AND c.grantee IN ('anon', 'authenticated')
      AND NOT EXISTS (
        SELECT 1 FROM public_grant_allowlist a
        WHERE a.grantee = c.grantee
          AND a.object_type = 'COLUMN'
          AND a.object_name = (c.table_name || '.' || c.column_name)
          AND a.privilege_type = c.privilege_type
      )
  LOOP
    v_unexpected := v_unexpected || (r.grantee || ' on ' || r.object_type || ' ' || r.object_name || ' (' || r.privilege_type || ')');
  END LOOP;

  -- Check actual Routine / Function grants in schema public
  FOR r IN
    SELECT p.grantee,
           'FUNCTION' AS object_type,
           p.routine_name AS object_name,
           p.privilege_type
    FROM information_schema.routine_privileges p
    WHERE p.routine_schema = 'public'
      AND p.grantee IN ('anon', 'authenticated')
      AND NOT EXISTS (
        SELECT 1 FROM public_grant_allowlist a
        WHERE a.grantee = p.grantee
          AND a.object_type = 'FUNCTION'
          AND a.object_name = p.routine_name
          AND a.privilege_type = p.privilege_type
      )
  LOOP
    v_unexpected := v_unexpected || (r.grantee || ' on ' || r.object_type || ' ' || r.object_name || ' (' || r.privilege_type || ')');
  END LOOP;

  -- Check actual Sequence grants in schema public
  FOR r IN
    SELECT u.grantee,
           'SEQUENCE' AS object_type,
           u.object_name,
           u.privilege_type
    FROM information_schema.usage_privileges u
    WHERE u.object_schema = 'public'
      AND u.object_type = 'SEQUENCE'
      AND u.grantee IN ('anon', 'authenticated')
      AND NOT EXISTS (
        SELECT 1 FROM public_grant_allowlist a
        WHERE a.grantee = u.grantee
          AND a.object_type = 'SEQUENCE'
          AND a.object_name = u.object_name
          AND a.privilege_type = u.privilege_type
      )
  LOOP
    v_unexpected := v_unexpected || (u.grantee || ' on ' || u.object_type || ' ' || u.object_name || ' (' || u.privilege_type || ')');
  END LOOP;

  -- Fail if any unauthorized grant is detected
  IF array_length(v_unexpected, 1) IS NOT NULL THEN
    RAISE EXCEPTION 'Grant allowlist check FAILED: unexpected privileges found in schema public for anon/authenticated: %', v_unexpected;
  END IF;

  RAISE NOTICE 'Grant allowlist check PASSED: all schema public privileges for anon and authenticated match the allowlist';
END $$;

ROLLBACK;

