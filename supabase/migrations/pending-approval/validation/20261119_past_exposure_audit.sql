-- Past-exposure audit: did anyone use the holes closed by the 2026 security migrations?
--
-- READ-ONLY. Every statement is a SELECT. Nothing is written, locked or granted. It is not a
-- migration and has no rollback; it lives in validation/ because the Supabase CLI never reads this
-- folder. Run it in the Supabase SQL editor as postgres (it reads auth.users). The SQL editor shows
-- only the last result, so select one query at a time and run the selection.
--
-- Each query names the WINDOW in which the abuse was possible and what a hit means. A hit is a lead
-- to review, not proof: legitimate operator actions (SQL editor promotions, imports, admin
-- resets) also produce some of these shapes. Do not paste the result rows (they hold user ids and
-- emails) into chat, tickets or AI agents.
--
-- Windows refer to when a migration reached production, not its file timestamp. Check the real
-- apply dates with:
--   SELECT version, name FROM supabase_migrations.schema_migrations ORDER BY version;
--
-- Parameters: each query that needs one takes it from the `params` CTE at its top. Adjust there.

-- ---------------------------------------------------------------------------------------------
-- Q1. Admins with no admin-console grant on record.
-- WINDOW: from 20260728000002 (users table with the unrestricted "Users can update own profile"
--   policy) until 20261010000001_guard_privileged_user_columns reached production. In that window
--   any signed-in learner could PATCH their own row with is_admin = true using the anon key.
--   After it, only a custom-role JWT could, until 20261027000002 (allow-list guard) is applied.
-- HIT: is_admin = true and no admin_audit_logs row with action 'grant_admin_role' targeting the
--   user. Expected hits: admins promoted by hand in the SQL editor (for example through
--   pending-approval/admin_backfill_from_admin_emails.sql), which writes no audit row. Every other
--   hit is a self-promotion candidate: demote at once, then review that user's admin_audit_logs
--   entries as actor (admin_user_id) for what they did.
-- ---------------------------------------------------------------------------------------------
SELECT u.id,
       u.email,
       u.created_at,
       au.last_sign_in_at,
       (SELECT count(*) FROM public.admin_audit_logs l WHERE l.admin_user_id = u.id) AS actions_as_admin
  FROM public.users u
  LEFT JOIN auth.users au ON au.id = u.id
 WHERE u.is_admin = true
   AND NOT EXISTS (
     SELECT 1 FROM public.admin_audit_logs l
      WHERE l.action = 'grant_admin_role'
        AND l.target_id = u.id::text
   )
 ORDER BY u.created_at;

-- ---------------------------------------------------------------------------------------------
-- Q2. Fellows with no fellow grant on record.
-- WINDOW: from 20260830000001 (is_fellow column) until 20261010000001 reached production, same
--   mechanism as Q1 (self PATCH of is_fellow).
-- HIT: is_fellow = true with no audit row for a fellow grant ('grant_fellow_status',
--   'set_fellow_status') and no approved fellow request reviewed by an admin. Revoke and review.
-- ---------------------------------------------------------------------------------------------
SELECT u.id, u.email, u.created_at
  FROM public.users u
 WHERE u.is_fellow = true
   AND NOT EXISTS (
     SELECT 1 FROM public.admin_audit_logs l
      WHERE l.action IN ('grant_fellow_status', 'set_fellow_status')
        AND l.target_id = u.id::text
   )
   AND NOT EXISTS (
     SELECT 1 FROM public.fellow_requests fr
       JOIN public.users rv ON rv.id = fr.reviewed_by AND rv.is_admin = true
      WHERE fr.user_id = u.id
        AND fr.status = 'approved'
   )
 ORDER BY u.created_at;

-- ---------------------------------------------------------------------------------------------
-- Q3. Quiz XP above what the content allows.
-- WINDOW: from 20260925000002_phase_t2_backend_reliability (record_lesson_quiz_completion and
--   sync_user_xp granted to authenticated, with caller-chosen user id, lesson id and correct count)
--   until 20261018000001_lockdown_public_grants reached production. A learner could award
--   quiz_correct XP to any user, for any lesson, at any amount.
-- LIMIT: the largest quiz in content/dist has 15 questions (90 lessons, computed 2026-11-19), and
--   the per-question XP is QUIZ_CORRECT (5 by default, admin-configurable as xpPerQuizPass; the
--   RPC default is 10). The RPC caps the running total per (user, lesson) at correct * per-question,
--   so the SUM per (user, lesson) can never legitimately exceed 15 * per-question XP.
--   Set per_question_xp to the highest value the admin setting ever had.
-- HIT: a (user, lesson) total above the cap, or a single event above it. Remove the excess with a
--   compensating negative xp_events row (admin_reset style) after review, never by deleting rows.
-- ---------------------------------------------------------------------------------------------
WITH params AS (
  SELECT 15 AS max_questions_per_lesson,
         10 AS per_question_xp
)
SELECT x.user_id,
       x.source_id AS lesson_id,
       count(*) AS events,
       sum(x.xp_amount) AS quiz_correct_xp,
       max(x.xp_amount) AS largest_event,
       min(x.created_at) AS first_at,
       max(x.created_at) AS last_at,
       p.max_questions_per_lesson * p.per_question_xp AS cap
  FROM public.xp_events x
 CROSS JOIN params p
 WHERE x.source_type = 'quiz_correct'
 GROUP BY x.user_id, x.source_id, p.max_questions_per_lesson, p.per_question_xp
HAVING sum(x.xp_amount) > p.max_questions_per_lesson * p.per_question_xp
    OR max(x.xp_amount) > p.max_questions_per_lesson * p.per_question_xp
 ORDER BY quiz_correct_xp DESC;

-- ---------------------------------------------------------------------------------------------
-- Q4. Quiz XP for lessons the user never completed or attempted.
-- WINDOW: same as Q3. The leaked RPC let a caller name any lesson id and any user id.
-- HIT: quiz_correct XP with no user_lesson_progress row and no quiz_attempts row for that user and
--   lesson. Review together with Q3.
-- ---------------------------------------------------------------------------------------------
SELECT x.user_id, x.source_id AS lesson_id, sum(x.xp_amount) AS quiz_correct_xp, min(x.created_at) AS first_at
  FROM public.xp_events x
 WHERE x.source_type = 'quiz_correct'
   AND NOT EXISTS (
     SELECT 1 FROM public.user_lesson_progress p
      WHERE p.user_id = x.user_id AND p.lesson_id = x.source_id
   )
   AND NOT EXISTS (
     SELECT 1 FROM public.quiz_attempts q
      WHERE q.user_id = x.user_id AND q.lesson_id = x.source_id
   )
 GROUP BY x.user_id, x.source_id
 ORDER BY first_at;

-- ---------------------------------------------------------------------------------------------
-- Q5. Email broadcasts not created by an admin.
-- WINDOW: from 20260826000003_create_email_broadcasts ("Service role has full access to
--   email_broadcasts", FOR ALL with no TO clause and USING (true)) until 20261018000001 reached
--   production. Anyone with the anon key could create, edit or start a broadcast to every learner.
-- HIT: created_by is NULL or not a current admin, or the row was edited after its creator lost
--   admin. Check status and sent_count: a 'completed' or 'sending' hit means mail went out.
-- ---------------------------------------------------------------------------------------------
SELECT b.id, b.name, b.template_key, b.subject_override, b.status, b.sent_count,
       b.recipient_filters, b.created_by, b.created_at, b.updated_at
  FROM public.email_broadcasts b
  LEFT JOIN public.users u ON u.id = b.created_by
 WHERE b.created_by IS NULL
    OR u.id IS NULL
    OR u.is_admin IS NOT TRUE
 ORDER BY b.created_at;

-- ---------------------------------------------------------------------------------------------
-- Q6. Fellow requests approved without an admin reviewer.
-- WINDOW: from 20260905000001_create_fellow_requests ("Service role has full access to
--   fellow_requests", FOR ALL, no TO clause, USING (true)) until 20261018000001 reached production.
--   Anyone could approve any request, their own included.
-- HIT: status 'approved' with reviewed_by NULL, or a reviewer who is not an admin. The matching
--   users.is_fellow (if true) should be reviewed with Q2.
-- ---------------------------------------------------------------------------------------------
SELECT fr.id, fr.user_id, fr.status, fr.requested_at, fr.reviewed_by, fr.reviewed_at,
       u.is_fellow AS user_is_fellow_now
  FROM public.fellow_requests fr
  JOIN public.users u ON u.id = fr.user_id
  LEFT JOIN public.users rv ON rv.id = fr.reviewed_by
 WHERE fr.status = 'approved'
   AND (fr.reviewed_by IS NULL OR rv.is_admin IS NOT TRUE)
 ORDER BY fr.requested_at;

-- ---------------------------------------------------------------------------------------------
-- Q7. Published testimonials with no moderator.
-- WINDOW: from 20260809000000_create_testimonials_table ("Users can submit feedback", INSERT for
--   authenticated with no column limit, so is_published = true and status = 'approved' could be
--   set directly) until 20261018000001 dropped that policy.
-- HIT: is_published = true (or status 'approved') with reviewed_by NULL or a non-admin reviewer.
--   Unpublish, then moderate through the admin console. The marketing site shows these rows.
-- ---------------------------------------------------------------------------------------------
SELECT t.id, t.user_id, t.status, t.is_published, t.is_featured, t.rating, t.headline,
       t.reviewed_by, t.reviewed_at, t.created_at
  FROM public.testimonials t
  LEFT JOIN public.users rv ON rv.id = t.reviewed_by
 WHERE (t.is_published = true OR t.status = 'approved')
   AND (t.reviewed_by IS NULL OR rv.is_admin IS NOT TRUE)
 ORDER BY t.created_at;

-- ---------------------------------------------------------------------------------------------
-- Q8. Certificates that fail the issuance prerequisites (best effort).
-- WINDOW: from 20260805000004_create_certificates ("Users can insert own certificates", INSERT
--   WITH CHECK (auth.uid() = user_id) and no column limit) until 20260925000001 dropped it. A
--   learner could insert any certificate for themselves (type, level, career_title, counts) with
--   no completed lessons.
-- RULES (lib/certificates-db.ts): full_curriculum needs all 90 lessons completed; module_completion
--   needs all lessons of the module (10 per module in content/dist/curriculum.json). The database
--   does not know which lessons belong to which module, so a module certificate is flagged when the
--   user had fewer than 10 completed lessons in total when it was issued.
-- HIT: review the certificate; if forged, delete it in the admin console (verification links stop
--   resolving). False positives: rows issued with bypassPrerequisites (admin/test issuance, career
--   title starting '[TEST]'), and learners whose progress was reset after issuance.
-- ---------------------------------------------------------------------------------------------
WITH params AS (
  SELECT 90 AS full_curriculum_lessons,
         10 AS lessons_per_module
),
completed AS (
  SELECT c.id AS certificate_id,
         (SELECT count(*) FROM public.user_lesson_progress p
           WHERE p.user_id = c.user_id
             AND p.status = 'completed'
             AND (p.completed_at IS NULL OR p.completed_at <= c.issued_at)) AS completed_at_issue,
         (SELECT count(*) FROM public.user_lesson_progress p
           WHERE p.user_id = c.user_id AND p.status = 'completed') AS completed_now
    FROM public.certificates c
)
SELECT c.id, c.user_id, c.type, c.module_slug, c.career_title, c.lessons_completed AS lessons_claimed,
       k.completed_at_issue, k.completed_now, c.issued_at
  FROM public.certificates c
  JOIN completed k ON k.certificate_id = c.id
 CROSS JOIN params p
 WHERE (c.type = 'full_curriculum' AND k.completed_at_issue < p.full_curriculum_lessons)
    OR (c.type = 'module_completion' AND k.completed_at_issue < p.lessons_per_module)
    OR (c.type NOT IN ('full_curriculum', 'module_completion'))
    OR c.lessons_completed > k.completed_at_issue
 ORDER BY c.issued_at;

-- ---------------------------------------------------------------------------------------------
-- Q9. Profile XP or level out of step with the XP ledger.
-- WINDOW: any time. total_xp and level are recomputed from xp_events by the users triggers, so a
--   mismatch means a trigger was bypassed (SQL editor, disabled trigger, a write before the
--   trigger existed) or the level formula changed without a recompute (expected noise: the level
--   formula moved from calculate_user_level() to floor(total / 500) + 1 in 20260925000002).
-- HIT: a total_xp mismatch is the signal; a level-only mismatch is usually formula noise.
-- ---------------------------------------------------------------------------------------------
WITH ledger AS (
  SELECT user_id, coalesce(sum(xp_amount), 0)::bigint AS ledger_xp
    FROM public.xp_events
   GROUP BY user_id
)
SELECT u.id, u.total_xp, coalesce(l.ledger_xp, 0) AS ledger_xp, u.level,
       least(9, greatest(1, floor(coalesce(l.ledger_xp, 0) / 500.0)::int + 1)) AS expected_level,
       (u.total_xp IS DISTINCT FROM coalesce(l.ledger_xp, 0)) AS xp_mismatch
  FROM public.users u
  LEFT JOIN ledger l ON l.user_id = u.id
 WHERE u.total_xp IS DISTINCT FROM coalesce(l.ledger_xp, 0)
    OR u.level IS DISTINCT FROM least(9, greatest(1, floor(coalesce(l.ledger_xp, 0) / 500.0)::int + 1))
 ORDER BY xp_mismatch DESC, abs(u.total_xp - coalesce(l.ledger_xp, 0)) DESC;

-- ---------------------------------------------------------------------------------------------
-- Q10. Streaks longer than the account is old.
-- WINDOW: from 20260728000002 until 20261027000002_lock_public_users is applied. The streak columns
--   (current_streak, longest_streak, streak_freezes_available, last_streak_date) are not covered by
--   guard_privileged_user_columns, so a learner can still PATCH them on their own row through
--   PostgREST today. Streaks feed the leaderboard and streak badges.
-- HIT: a streak above the number of calendar days since signup (+1 for the signup day and +1 for
--   timezone skew). Reset the streak and review streak badges awarded to the user.
-- ---------------------------------------------------------------------------------------------
SELECT u.id, u.created_at, u.current_streak, u.longest_streak, u.streak_freezes_available,
       (current_date - u.created_at::date) + 2 AS max_plausible_days
  FROM public.users u
 WHERE u.current_streak > (current_date - u.created_at::date) + 2
    OR u.longest_streak > (current_date - u.created_at::date) + 2
 ORDER BY greatest(u.current_streak, u.longest_streak) DESC;

-- ---------------------------------------------------------------------------------------------
-- Q11. Contact messages that did not come through the app.
-- WINDOW: from 20260810000002 until 20261119000001_contact_messages_service_only is applied
--   ("Anyone can insert contact message" for the anon key).
-- HIT: more than 10 messages from one address, or a `source` value the app never writes. The
--   policy also let the caller set status, admin_notes and user_id; with_admin_notes counts rows
--   that carry notes, which you can compare against what admins actually wrote. Rows are
--   support-inbox spam at worst; delete after review.
-- ---------------------------------------------------------------------------------------------
SELECT lower(email) AS email, count(*) AS messages, min(created_at) AS first_at, max(created_at) AS last_at,
       count(*) FILTER (WHERE admin_notes IS NOT NULL) AS with_admin_notes,
       count(*) FILTER (WHERE source NOT IN ('web_form', 'inbound_email')) AS unknown_source
  FROM public.contact_messages
 GROUP BY lower(email)
HAVING count(*) > 10
    OR count(*) FILTER (WHERE source NOT IN ('web_form', 'inbound_email')) > 0
 ORDER BY messages DESC;

-- ---------------------------------------------------------------------------------------------
-- Q12. One-sided friendships and private cohort joins.
-- WINDOW: from 20260805000006 until 20261119000004_cohort_members_and_friends_lockdown is applied.
-- HIT (friends): rows the app could not have written. The app inserts only after a username or id
--   lookup and never with status other than 'accepted', so this shape alone is not proof; look for
--   one user adding many friends in a short time.
-- HIT (cohorts): membership in an is_private cohort. The app's join route does not check
--   is_private either, so review against who was meant to be in that cohort.
-- ---------------------------------------------------------------------------------------------
SELECT 'friends' AS kind, f.user_id, count(*) AS rows_added, min(f.created_at) AS first_at, max(f.created_at) AS last_at
  FROM public.user_friends f
 GROUP BY f.user_id
HAVING count(*) > 25
UNION ALL
SELECT 'private_cohort' AS kind, m.user_id, count(*) AS rows_added, min(m.joined_at), max(m.joined_at)
  FROM public.cohort_members m
  JOIN public.cohorts c ON c.id = m.cohort_id
 WHERE c.is_private = true
 GROUP BY m.user_id
 ORDER BY kind, rows_added DESC;
