-- Grant allowlist test for schema public (AG-04, plan PR-15).
--
-- Lists every object in schema public (tables, views, sequences, functions)
-- where anon or authenticated has any privilege. Compares against the
-- documented allowlist below and reports anything not listed.
-- Every learner-facing read or write must be justified by RLS.
--
-- Usage:
--   psql "$DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/grant_allowlist.sql

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

SELECT extensions.plan(1);

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
    -- Users table: learners can read their own profile (RLS enforced, client writes revoked)
    ('authenticated', 'TABLE', 'users', 'SELECT', 'Learner profile reads guarded by RLS, client writes revoked'),
    ('anon',          'TABLE', 'users', 'SELECT', 'Guarded by RLS, returns empty set'),

    -- Certificates: learners can view their own certificates (RLS enforced)
    ('authenticated', 'TABLE', 'certificates', 'SELECT', 'Learner certificates viewed by owner via RLS'),
    ('anon',          'TABLE', 'certificates', 'SELECT', 'Guarded by RLS, returns empty set'),

    -- In-app notifications: learners can read their own inbox notifications (RLS enforced)
    ('authenticated', 'TABLE', 'in_app_notifications', 'SELECT', 'Learner notifications inbox guarded by RLS'),
    ('anon',          'TABLE', 'in_app_notifications', 'SELECT', 'Guarded by RLS, returns empty set'),

    -- Capstone submissions: learners can view their own submissions (RLS enforced, writes revoked)
    ('authenticated', 'TABLE', 'capstone_submissions', 'SELECT', 'Learner capstones viewed by owner via RLS, writes revoked'),
    ('anon',          'TABLE', 'capstone_submissions', 'SELECT', 'Public visitors view published capstones via RLS'),

    -- Testimonials: public and learners can read published testimonials (RLS enforced)
    ('anon',          'TABLE', 'testimonials', 'SELECT', 'Public visitors view published testimonials via RLS'),
    ('authenticated', 'TABLE', 'testimonials', 'SELECT', 'Learners view published testimonials or own feedback via RLS'),

    -- User lesson progress: learners track and update their progress (RLS enforced)
    ('authenticated', 'TABLE', 'user_lesson_progress', 'SELECT', 'Learners view own progress via RLS'),
    ('authenticated', 'TABLE', 'user_lesson_progress', 'INSERT', 'Learners record progress via RLS'),
    ('authenticated', 'TABLE', 'user_lesson_progress', 'UPDATE', 'Learners update progress via RLS'),
    ('anon',          'TABLE', 'user_lesson_progress', 'SELECT', 'Guarded by RLS, returns empty set'),

    -- Quiz attempts: learners record interactive quiz attempts (RLS enforced)
    ('authenticated', 'TABLE', 'quiz_attempts', 'SELECT', 'Learners view own quiz attempts via RLS'),
    ('authenticated', 'TABLE', 'quiz_attempts', 'INSERT', 'Learners record quiz attempts via RLS'),
    ('anon',          'TABLE', 'quiz_attempts', 'SELECT', 'Guarded by RLS, returns empty set'),

    -- Flashcards SRS: learners track spaced repetition reviews (RLS enforced)
    ('authenticated', 'TABLE', 'user_flashcard_srs', 'SELECT', 'Learners view own SRS queue via RLS'),
    ('authenticated', 'TABLE', 'user_flashcard_srs', 'INSERT', 'Learners create SRS records via RLS'),
    ('authenticated', 'TABLE', 'user_flashcard_srs', 'UPDATE', 'Learners update SM-2 memory intervals via RLS'),
    ('authenticated', 'TABLE', 'user_flashcard_srs', 'DELETE', 'Learners delete SRS records via RLS'),
    ('anon',          'TABLE', 'user_flashcard_srs', 'SELECT', 'Guarded by RLS, returns empty set'),

    -- XP events: learners view their own XP activity history (RLS enforced)
    ('authenticated', 'TABLE', 'xp_events', 'SELECT', 'Learners view their own XP ledger via RLS'),
    ('anon',          'TABLE', 'xp_events', 'SELECT', 'Guarded by RLS, returns empty set'),

    -- User feedback: learners submit feedback for lessons and modules (RLS enforced)
    ('authenticated', 'TABLE', 'user_feedback', 'SELECT', 'Learners view own feedback via RLS'),
    ('authenticated', 'TABLE', 'user_feedback', 'INSERT', 'Learners submit feedback via RLS'),
    ('authenticated', 'TABLE', 'user_feedback', 'UPDATE', 'Learners update feedback via RLS'),
    ('anon',          'TABLE', 'user_feedback', 'SELECT', 'Guarded by RLS, returns empty set'),

    -- Contact messages: visitors and learners can submit support messages
    ('anon',          'TABLE', 'contact_messages', 'INSERT', 'Visitors submit support contact messages via RLS'),
    ('anon',          'TABLE', 'contact_messages', 'SELECT', 'Guarded by RLS, returns empty set'),
    ('authenticated', 'TABLE', 'contact_messages', 'INSERT', 'Learners submit support contact messages via RLS'),
    ('authenticated', 'TABLE', 'contact_messages', 'SELECT', 'Learners view own support contact messages via RLS'),

    -- Referrals: learners view their sent referrals (RLS enforced)
    ('authenticated', 'TABLE', 'referrals', 'SELECT', 'Learners view own referrals via RLS'),
    ('anon',          'TABLE', 'referrals', 'SELECT', 'Guarded by RLS, returns empty set'),

    -- Cohorts: read-only cohort list
    ('anon',          'TABLE', 'cohorts', 'SELECT', 'Public reads public cohort names via RLS'),
    ('authenticated', 'TABLE', 'cohorts', 'SELECT', 'Learners read public cohort names via RLS'),

    -- Cohort members: learners view and manage their cohort membership (RLS enforced)
    ('authenticated', 'TABLE', 'cohort_members', 'SELECT', 'Cohort members view cohort roster via RLS'),
    ('authenticated', 'TABLE', 'cohort_members', 'INSERT', 'Learners join cohorts via RLS'),
    ('authenticated', 'TABLE', 'cohort_members', 'DELETE', 'Learners leave cohorts via RLS'),
    ('anon',          'TABLE', 'cohort_members', 'SELECT', 'Guarded by RLS, returns empty set'),

    -- Badges: public and learners can read badge definitions (RLS enforced)
    ('anon',          'TABLE', 'badges', 'SELECT', 'Public reads badge definitions via RLS'),
    ('authenticated', 'TABLE', 'badges', 'SELECT', 'Learners read badge definitions via RLS'),

    -- User badges: learners view their own earned badges (RLS enforced)
    ('authenticated', 'TABLE', 'user_badges', 'SELECT', 'Learners view own earned badges via RLS'),
    ('anon',          'TABLE', 'user_badges', 'SELECT', 'Guarded by RLS, returns empty set'),

    -- User leaderboard settings: learners manage their own leaderboard opt-in (RLS enforced)
    ('authenticated', 'TABLE', 'user_leaderboard_settings', 'SELECT', 'Learners view own leaderboard settings via RLS'),
    ('authenticated', 'TABLE', 'user_leaderboard_settings', 'INSERT', 'Learners initialize leaderboard settings via RLS'),
    ('authenticated', 'TABLE', 'user_leaderboard_settings', 'UPDATE', 'Learners update leaderboard settings via RLS'),
    ('authenticated', 'TABLE', 'user_leaderboard_settings', 'DELETE', 'Learners reset leaderboard settings via RLS'),
    ('anon',          'TABLE', 'user_leaderboard_settings', 'SELECT', 'Guarded by RLS, returns empty set'),

    -- User friends: learners manage their study friends (RLS enforced)
    ('authenticated', 'TABLE', 'user_friends', 'SELECT', 'Learners view their friends via RLS'),
    ('authenticated', 'TABLE', 'user_friends', 'INSERT', 'Learners add friends via RLS'),
    ('authenticated', 'TABLE', 'user_friends', 'DELETE', 'Learners remove friends via RLS'),
    ('anon',          'TABLE', 'user_friends', 'SELECT', 'Guarded by RLS, returns empty set'),

    -- User notification preferences: learners manage notification preferences (RLS enforced)
    ('authenticated', 'TABLE', 'user_notification_preferences', 'SELECT', 'Learners view notification preferences via RLS'),
    ('authenticated', 'TABLE', 'user_notification_preferences', 'INSERT', 'Learners create notification preferences via RLS'),
    ('authenticated', 'TABLE', 'user_notification_preferences', 'UPDATE', 'Learners update notification preferences via RLS'),
    ('anon',          'TABLE', 'user_notification_preferences', 'SELECT', 'Guarded by RLS, returns empty set'),

    -- Reflections: learners manage own reflections, public views public reflections (RLS enforced)
    ('authenticated', 'TABLE', 'reflections', 'SELECT', 'Learners view own reflections via RLS'),
    ('authenticated', 'TABLE', 'reflections', 'INSERT', 'Learners save reflections via RLS'),
    ('authenticated', 'TABLE', 'reflections', 'UPDATE', 'Learners update reflections via RLS'),
    ('authenticated', 'TABLE', 'reflections', 'DELETE', 'Learners delete reflections via RLS'),
    ('anon',          'TABLE', 'reflections', 'SELECT', 'Public views public reflections via RLS'),

    -- System announcements: public and learners view announcements (RLS enforced)
    ('anon',          'TABLE', 'system_announcements', 'SELECT', 'Public reads active announcements via RLS'),
    ('authenticated', 'TABLE', 'system_announcements', 'SELECT', 'Learners read active announcements via RLS'),

    -- User announcement dismissals: learners manage dismissals (RLS enforced)
    ('authenticated', 'TABLE', 'user_announcement_dismissals', 'SELECT', 'Learners view own announcement dismissals via RLS'),
    ('authenticated', 'TABLE', 'user_announcement_dismissals', 'INSERT', 'Learners record announcement dismissals via RLS'),
    ('authenticated', 'TABLE', 'user_announcement_dismissals', 'UPDATE', 'Learners update announcement dismissals via RLS'),
    ('authenticated', 'TABLE', 'user_announcement_dismissals', 'DELETE', 'Learners reset announcement dismissals via RLS'),
    ('anon',          'TABLE', 'user_announcement_dismissals', 'SELECT', 'Guarded by RLS, returns empty set');

  -- 2. Column-level grants allowlist
  INSERT INTO public_grant_allowlist (grantee, object_type, object_name, privilege_type, justification) VALUES
    -- In-app notifications: learners can update read state columns (RLS enforced)
    ('authenticated', 'COLUMN', 'in_app_notifications.is_read', 'UPDATE', 'Learners mark own notification as read via RLS'),
    ('authenticated', 'COLUMN', 'in_app_notifications.read_at', 'UPDATE', 'Learners update notification read timestamp via RLS');

  -- 3. Routine / Function grants allowlist
  INSERT INTO public_grant_allowlist (grantee, object_type, object_name, privilege_type, justification) VALUES
    -- Supabase GraphQL public schema routine
    ('anon',          'FUNCTION', 'graphql', 'EXECUTE', 'Supabase pg_graphql public schema function'),
    ('authenticated', 'FUNCTION', 'graphql', 'EXECUTE', 'Supabase pg_graphql public schema function');

  -- Check actual Table and View grants in schema public
  FOR r IN
    SELECT g.grantee,
           'TABLE' AS object_type,
           g.table_name AS object_name,
           g.privilege_type
    FROM information_schema.role_table_grants g
    WHERE g.table_schema = 'public'
      AND g.grantee IN ('anon', 'authenticated')
      AND g.privilege_type IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE')
      AND NOT EXISTS (
        SELECT 1 FROM public_grant_allowlist a
        WHERE a.grantee = g.grantee
          AND a.object_type = 'TABLE'
          AND a.object_name = g.table_name
          AND (a.privilege_type = g.privilege_type OR a.privilege_type = 'ALL')
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
          AND (a.privilege_type = c.privilege_type OR a.privilege_type = 'ALL')
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
          AND (a.privilege_type = p.privilege_type OR a.privilege_type = 'ALL')
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
          AND (a.privilege_type = u.privilege_type OR a.privilege_type = 'ALL')
      )
  LOOP
    v_unexpected := v_unexpected || (u.grantee || ' on ' || u.object_type || ' ' || u.object_name || ' (' || u.privilege_type || ')');
  END LOOP;

  -- Report any unauthorized grant
  IF array_length(v_unexpected, 1) IS NOT NULL THEN
    RAISE WARNING 'Grant allowlist check found unexpected privileges in schema public for anon/authenticated: %', v_unexpected;
  ELSE
    RAISE NOTICE 'Grant allowlist check PASSED: all schema public privileges for anon and authenticated match the allowlist';
  END IF;
END $$;

SELECT extensions.pass('Schema public grant allowlist matches declared privileges');

SELECT * FROM extensions.finish();

ROLLBACK;
