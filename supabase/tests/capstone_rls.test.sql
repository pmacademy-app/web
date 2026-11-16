-- pgTAP tests for public.capstone_submissions Row Level Security and write guards (AG-05)
-- Verifies:
-- 1. Learner can select own capstone submissions.
-- 2. Learner cannot select another user's non-public capstone submissions.
-- 3. Learner cannot insert capstone submissions (revoked by 20261024000002_lock_users_and_capstone_client_writes).
-- 4. Learner cannot update capstone submissions.
-- 5. Learner cannot delete capstone submissions.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

SELECT extensions.plan(5);

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

-- Seed submissions
INSERT INTO public.capstone_submissions (id, user_id, module_slug, content, status, is_public)
VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid, '33333333-3333-3333-3333-333333333333'::uuid, 'module-1', 'Capstone C content', 'submitted', false),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid, '44444444-4444-4444-4444-444444444444'::uuid, 'module-1', 'Capstone D content', 'submitted', false)
ON CONFLICT (id) DO NOTHING;

-- Act as Learner C
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', '33333333-3333-3333-3333-333333333333', 'role', 'authenticated', 'email', 'learner_c@example.com')::text, true);

-- 1. Learner C can select own submission
SELECT extensions.is(
  (SELECT count(*)::int FROM public.capstone_submissions WHERE user_id = '33333333-3333-3333-3333-333333333333'::uuid),
  1,
  'Learner C can select own capstone submission'
);

-- 2. Learner C cannot select Learner D non-public submission
SELECT extensions.is(
  (SELECT count(*)::int FROM public.capstone_submissions WHERE user_id = '44444444-4444-4444-4444-444444444444'::uuid),
  0,
  'Learner C cannot select Learner D non-public capstone submission'
);

-- 3. Learner C cannot insert into capstone_submissions
SELECT extensions.throws_ok(
  $$ INSERT INTO public.capstone_submissions (user_id, module_slug, content, status) VALUES ('33333333-3333-3333-3333-333333333333'::uuid, 'module-2', 'New Capstone', 'submitted') $$,
  '42501',
  NULL,
  'Learner cannot insert into capstone_submissions'
);

-- 4. Learner C cannot update capstone_submissions
SELECT extensions.throws_ok(
  $$ UPDATE public.capstone_submissions SET content = 'Updated content' WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid $$,
  '42501',
  NULL,
  'Learner cannot update capstone_submissions'
);

-- 5. Learner C cannot delete capstone_submissions
SELECT extensions.throws_ok(
  $$ DELETE FROM public.capstone_submissions WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid $$,
  '42501',
  NULL,
  'Learner cannot delete from capstone_submissions'
);

RESET ROLE;

SELECT * FROM extensions.finish();

ROLLBACK;
