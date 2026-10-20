-- Phase 1 / PR-01 evidence and forensics (08-IMPLEMENTATION-PLAN.md:66-81 and :95-101).
--
-- READ ONLY. Every section runs in its own BEGIN TRANSACTION READ ONLY ... ROLLBACK and only
-- SELECTs, so it is safe on production. It changes nothing: revoking forged certificates or
-- unpublishing forged testimonials is a separate, deliberate step after a human reviews the
-- output.
--
-- Two sections, run at different times:
--
--   A. PRE-DEPLOY. Run on production BEFORE 20261018000001_lockdown_public_grants.sql is
--      applied, and save the output. Query A2 in particular loses its evidence once the
--      migration drops public_profiles.
--   B. POST-DEPLOY FORENSICS. Run on production after the migration is applied. Needs the
--      lesson question counts pasted in first (see B0).
--
-- In the Supabase SQL editor only the last result of a run is shown, so paste and run one
-- query at a time (keep the BEGIN/set_config lines with it). With psql the whole section can
-- be run at once:
--   psql "$PRODUCTION_DB_URL" -f supabase/migrations/validation/20261018000001_forensics.sql
-- (Section B fails at the B0 guard until the placeholder is replaced, and returns nothing.)

-- ===========================================================================
-- A. PRE-DEPLOY: evidence that disappears when the migration runs
-- ===========================================================================

BEGIN TRANSACTION READ ONLY;

-- A1. Who can execute SECURITY DEFINER functions in public (plan query 1).
SELECT p.oid::regprocedure AS function,
       has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_exec,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth_exec
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.prosecdef
ORDER BY 1;

-- A2. Was public_profiles writable? (plan query 2; decides SEC-02 severity and forensics).
--     Any INSERT, UPDATE or DELETE for anon or authenticated here means learners could write
--     through the view into public.users, bypassing RLS and the privileged-column guard.
SELECT grantee, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public' AND table_name = 'public_profiles'
ORDER BY grantee, privilege_type;

-- A3. Policies that apply to every role with USING (true) (plan query 3).
SELECT tablename, policyname, roles, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public' AND roles = '{public}' AND qual = 'true'
ORDER BY tablename, policyname;

-- A4. Owner and ACL of the four functions the migration changes. The migration's REVOKE only
--     removes grants made by the role that runs it (postgres); an owner other than postgres
--     or a grantor other than postgres in proacl means the REVOKE may need to run as that role.
SELECT p.oid::regprocedure AS function,
       p.proowner::regrole AS owner,
       p.prosecdef AS security_definer,
       p.proconfig,
       p.proacl
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('sync_user_xp', 'record_lesson_quiz_completion', 'update_user_xp_and_level', 'sync_user_xp_and_level_on_update')
ORDER BY 1;

ROLLBACK;

-- ===========================================================================
-- B. POST-DEPLOY FORENSICS (SEC-01, SEC-03, SEC-05, SEC-06)
-- ===========================================================================

BEGIN TRANSACTION READ ONLY;

-- B0. Inputs.
--
-- The curriculum is static content, not a table. content/dist/curriculum.json lists every
-- lesson as { "id": "les_xxxxxx", "slug": "lesson-001", "module": ..., ... }; lesson ids are
-- "les_" plus 6 lowercase letters or digits (user_lesson_progress.lesson_id has a CHECK for
-- the "les_" prefix, so a forged id still starts with it). Each lesson's quiz questions are in
-- content/dist/lessons/<id>.json under blocks[] with type "quiz".
--
-- Generate the input from the repo root and paste the printed JSON in place of the
-- placeholder below (one object mapping lesson id to its quiz question count):
--   node -e "const fs=require('fs');const c=require('./content/dist/curriculum.json');const o={};for(const l of c.lessons){const d=JSON.parse(fs.readFileSync('content/dist/lessons/'+l.id+'.json','utf8'));o[l.id]=d.blocks.filter(b=>b.type==='quiz').reduce((n,b)=>n+(b.questions||[]).length,0)}console.log(JSON.stringify(o))"
--
-- xp_per_question: the HIGHEST per-question quiz XP ever configured. The current value is read
-- from system_settings below (learning_settings / legacy learning, keys xpPerQuizPass or
-- xpPerQuizCorrect, code default 5). If an admin lowered it at some point, put the old, higher
-- value in pr01.xp_per_question so honest learners are not flagged.
SELECT set_config('pr01.lesson_questions', 'PASTE_LESSON_QUESTIONS_JSON_HERE', true);
SELECT set_config('pr01.xp_per_question', '', true);

DO $$
BEGIN
  IF current_setting('pr01.lesson_questions') = 'PASTE_LESSON_QUESTIONS_JSON_HERE' THEN
    RAISE EXCEPTION 'PR-01 forensics: paste the lesson question JSON into pr01.lesson_questions first (see B0)';
  END IF;
  PERFORM current_setting('pr01.lesson_questions')::jsonb;
END $$;

-- B1. SEC-01: quiz_correct XP above what the lesson's questions can earn, per learner and
--     lesson. A learner with a user_reset/admin_reset event may have earned a lesson twice;
--     check had_reset before acting. Lessons not in the curriculum show max_possible NULL.
WITH lessons AS (
  SELECT key AS lesson_id, value::int AS question_count
  FROM jsonb_each_text(current_setting('pr01.lesson_questions')::jsonb)
),
configured AS (
  SELECT s.value ->> k AS v
  FROM public.system_settings s
  CROSS JOIN unnest(ARRAY['xpPerQuizPass', 'xpPerQuizCorrect']) AS k
  WHERE s.key IN ('learning_settings', 'learning')
),
params AS (
  SELECT greatest(
    5,
    coalesce((SELECT max(v::int) FROM configured WHERE v ~ '^[0-9]+$'), 0),
    coalesce(nullif(current_setting('pr01.xp_per_question'), '')::int, 0)
  ) AS xp_per_question
),
earned AS (
  SELECT e.user_id, e.source_id AS lesson_id, sum(e.xp_amount) AS quiz_xp, count(*) AS events,
         min(e.created_at) AS first_at, max(e.created_at) AS last_at
  FROM public.xp_events e
  WHERE e.source_type = 'quiz_correct'
  GROUP BY e.user_id, e.source_id
)
SELECT er.user_id, er.lesson_id, er.quiz_xp, er.events,
       l.question_count * p.xp_per_question AS max_possible,
       p.xp_per_question,
       EXISTS (
         SELECT 1 FROM public.xp_events r
         WHERE r.user_id = er.user_id AND r.source_type IN ('user_reset', 'admin_reset')
       ) AS had_reset,
       er.first_at, er.last_at
FROM earned er
CROSS JOIN params p
LEFT JOIN lessons l ON l.lesson_id = er.lesson_id
WHERE l.lesson_id IS NULL
   OR er.quiz_xp > l.question_count * p.xp_per_question
ORDER BY er.quiz_xp DESC;

-- B2. SEC-01: progress, quiz attempts and lesson XP for lesson ids that are not in the
--     curriculum (only reachable by calling record_lesson_quiz_completion directly).
WITH lessons AS (
  SELECT key AS lesson_id FROM jsonb_each_text(current_setting('pr01.lesson_questions')::jsonb)
)
SELECT 'user_lesson_progress' AS source, p.user_id, p.lesson_id, p.status, p.completed_at AS at
FROM public.user_lesson_progress p
WHERE p.lesson_id NOT IN (SELECT lesson_id FROM lessons)
UNION ALL
SELECT 'quiz_attempts', q.user_id, q.lesson_id, NULL, max(q.attempted_at)
FROM public.quiz_attempts q
WHERE q.lesson_id NOT IN (SELECT lesson_id FROM lessons)
GROUP BY q.user_id, q.lesson_id
UNION ALL
SELECT 'xp_events:' || e.source_type, e.user_id, e.source_id, NULL, max(e.created_at)
FROM public.xp_events e
WHERE e.source_type IN ('theory_read', 'quiz_correct', 'quiz_bonus')
  AND e.source_id IS NOT NULL
  AND e.source_id NOT IN (SELECT lesson_id FROM lessons)
GROUP BY e.source_type, e.user_id, e.source_id
ORDER BY source, user_id;

-- B3. SEC-01: certificates whose holder has lessons marked completed without the theory ever
--     being read. The normal flow sets theory_read_at before a lesson can complete, so these
--     completions most likely came from a direct RPC call. For a module_completion certificate,
--     compare the lesson ids against that module before revoking.
SELECT c.id AS certificate_id, c.certificate_code, c.type, c.module_slug, c.user_id, c.issued_at,
       count(*) AS completed_without_theory,
       array_agg(p.lesson_id ORDER BY p.lesson_id) AS lesson_ids
FROM public.certificates c
JOIN public.user_lesson_progress p ON p.user_id = c.user_id
WHERE p.status = 'completed' AND p.theory_read_at IS NULL
GROUP BY c.id, c.certificate_code, c.type, c.module_slug, c.user_id, c.issued_at
ORDER BY c.issued_at DESC;

-- B4. SEC-05: published testimonials that did not pass through the admin moderation route.
--     That route (lib/admin/feedback-service.ts moderateTestimonial) always sets reviewed_by
--     to the admin's id and reviewed_at, and publishing sets status = 'approved'. The learner
--     route inserts status 'pending' and is_published false.
SELECT t.id, t.user_id, t.status, t.is_published, t.is_featured, t.reviewed_by, t.reviewed_at,
       t.created_at, t.author_name, t.headline, left(t.content, 120) AS content_start,
       (t.reviewed_by IS NULL) AS no_reviewer,
       (t.reviewed_by IS NOT NULL AND NOT coalesce(r.is_admin, false)) AS reviewer_not_admin
FROM public.testimonials t
LEFT JOIN public.users r ON r.id = t.reviewed_by
WHERE t.is_published = true
  AND (t.reviewed_by IS NULL
       OR t.reviewed_at IS NULL
       OR t.status <> 'approved'
       OR NOT coalesce(r.is_admin, false))
ORDER BY t.created_at DESC;

-- B5. SEC-03: email_broadcasts not created by a current admin. created_by references
--     auth.users with ON DELETE SET NULL, so a NULL can also mean the admin account was
--     deleted, and an admin demoted since then also shows up: check each row by hand.
--     queued_emails shows how far a forged broadcast got.
SELECT b.id, b.name, b.template_key, b.status, b.created_by, b.created_at, b.scheduled_at,
       b.sent_count, b.total_recipients,
       (SELECT count(*) FROM public.email_queue q WHERE q.broadcast_id = b.id) AS queued_emails
FROM public.email_broadcasts b
LEFT JOIN public.users u ON u.id = b.created_by
WHERE b.created_by IS NULL OR NOT coalesce(u.is_admin, false)
ORDER BY b.created_at DESC;

-- B6. SEC-06: fellow_requests reviewed by someone who is not an admin (anon could UPDATE
--     status directly). Approval also sets users.is_fellow through the admin service, so check
--     holder_is_fellow and the admin audit log before revoking anyone's Fellow status.
SELECT f.id, f.user_id, f.status, f.reviewed_by, f.reviewed_at, f.requested_at,
       fu.is_fellow AS holder_is_fellow
FROM public.fellow_requests f
LEFT JOIN public.users r ON r.id = f.reviewed_by
LEFT JOIN public.users fu ON fu.id = f.user_id
WHERE f.status <> 'pending'
  AND (f.reviewed_by IS NULL OR f.reviewed_at IS NULL OR NOT coalesce(r.is_admin, false))
ORDER BY f.reviewed_at DESC NULLS FIRST;

ROLLBACK;
