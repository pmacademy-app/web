-- pgTAP tests for public.capstone_submissions review columns write guards (AG-26)
-- Verifies:
-- 1. Learner can select own capstone review columns.
-- 2. Learner cannot select another user's review columns.
-- 3. Learner cannot update review_scores, review_feedback, revision_count, review_history.
-- 4. Learner cannot insert capstone_submissions with review columns.
-- 5. Anon cannot update capstone_submissions review columns.
-- 6. Anon cannot insert capstone_submissions review columns.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

SELECT extensions.plan(6);

-- Seed two test users in auth.users and public.users
INSERT INTO auth.users (id, email, aud, role)
VALUES
  ('33333333-3333-3333-3333-333333333333'::uuid, 'learner_c@example.com', 'authenticated', 'authenticated'),
  ('44444444-4444-4444-4444-444444444444'::uuid, 'learner_d@example.com', 'authenticated', 'authenticated')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.users (id, email, name)
VALUES
  ('33333333-3333-3333-3333-333333333333'::uuid, 'learner_c@example.com', 'Learner C'),
  ('44444444-4444-4444-4444-444444444444'::uuid, 'learner_d@example.com', 'Learner D')
ON CONFLICT (id) DO NOTHING;

-- Seed submissions with review fields
INSERT INTO public.capstone_submissions (
  id, user_id, module_slug, content, status, is_public,
  review_scores, review_feedback, revision_count, review_history
)
VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid, '33333333-3333-3333-3333-333333333333'::uuid, 'module-1', 'Capstone C content', 'reviewed', false, '{"req_problem": 3}'::jsonb, 'Feedback for C', 0, '[]'::jsonb),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid, '44444444-4444-4444-4444-444444444444'::uuid, 'module-1', 'Capstone D content', 'reviewed', false, '{"req_problem": 2}'::jsonb, 'Feedback for D', 0, '[]'::jsonb)
ON CONFLICT (id) DO NOTHING;

-- Act as Learner C (authenticated)
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', '33333333-3333-3333-3333-333333333333', 'role', 'authenticated', 'email', 'learner_c@example.com')::text, true);

-- 1. Learner C can select own review columns
SELECT extensions.is(
  (SELECT review_feedback FROM public.capstone_submissions WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid),
  'Feedback for C',
  'Learner C can select own capstone review feedback'
);

-- 2. Learner C cannot select Learner D review feedback
SELECT extensions.is(
  (SELECT count(*)::int FROM public.capstone_submissions WHERE id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid),
  0,
  'Learner C cannot select Learner D submission or review feedback'
);

-- 3. Learner C cannot update review_scores or review_feedback
SELECT extensions.throws_ok(
  $$ UPDATE public.capstone_submissions SET review_scores = '{"req_problem": 3}'::jsonb, review_feedback = 'Self-awarded' WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid $$,
  '42501',
  NULL,
  'Authenticated learner cannot update review columns'
);

-- 4. Learner C cannot insert review columns into capstone_submissions
SELECT extensions.throws_ok(
  $$ INSERT INTO public.capstone_submissions (user_id, module_slug, content, status, review_scores) VALUES ('33333333-3333-3333-3333-333333333333'::uuid, 'module-2', 'New Capstone', 'submitted', '{"req_problem": 3}'::jsonb) $$,
  '42501',
  NULL,
  'Authenticated learner cannot insert review columns'
);

RESET ROLE;

-- Act as anon
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);

-- 5. Anon cannot update review columns
SELECT extensions.throws_ok(
  $$ UPDATE public.capstone_submissions SET review_feedback = 'Hacked' WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid $$,
  '42501',
  NULL,
  'Anon cannot update review columns'
);

-- 6. Anon cannot insert into capstone_submissions
SELECT extensions.throws_ok(
  $$ INSERT INTO public.capstone_submissions (user_id, module_slug, content, status, review_scores) VALUES ('33333333-3333-3333-3333-333333333333'::uuid, 'module-2', 'New Capstone', 'submitted', '{"req_problem": 3}'::jsonb) $$,
  '42501',
  NULL,
  'Anon cannot insert review columns'
);

RESET ROLE;

SELECT * FROM extensions.finish();

ROLLBACK;
