-- pgTAP tests for record_lesson_quiz_completion RPC and XP deduplication (AG-05)
-- Verifies:
-- 1. Calling record_lesson_quiz_completion as service_role awards calculated XP on first completion.
-- 2. Calling record_lesson_quiz_completion a second time with identical input does not double-award XP.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

SELECT extensions.plan(4);

-- Seed test user in auth.users and public.users
INSERT INTO auth.users (id, email, aud, role)
VALUES ('77777777-7777-7777-7777-777777777777'::uuid, 'learner_quiz@example.com', 'authenticated', 'authenticated')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.users (id, email, name, total_xp, level)
VALUES ('77777777-7777-7777-7777-777777777777'::uuid, 'learner_quiz@example.com', 'Learner Quiz', 0, 1)
ON CONFLICT (id) DO UPDATE SET total_xp = 0, level = 1;

-- Act as service_role (the authorized caller of the quiz RPC)
SET LOCAL ROLE service_role;

-- 1. First completion call awards XP (5 questions correct * 10 XP + 20 bonus = 70 XP)
SELECT extensions.is(
  (
    SELECT (public.record_lesson_quiz_completion(
      '77777777-7777-7777-7777-777777777777'::uuid,
      'les_test_ag05',
      100,
      5,
      5,
      '[]'::jsonb,
      10,
      20
    )->>'total_xp_awarded')::int
  ),
  70,
  'First quiz completion awards 70 XP (50 correct + 20 perfect bonus)'
);

-- 2. User total XP is updated to 70
SELECT extensions.is(
  (SELECT total_xp FROM public.users WHERE id = '77777777-7777-7777-7777-777777777777'::uuid),
  70,
  'User XP in public.users is updated to 70 after first quiz completion'
);

-- 3. Second completion call with identical inputs awards 0 incremental XP
SELECT extensions.is(
  (
    SELECT (public.record_lesson_quiz_completion(
      '77777777-7777-7777-7777-777777777777'::uuid,
      'les_test_ag05',
      100,
      5,
      5,
      '[]'::jsonb,
      10,
      20
    )->>'total_xp_awarded')::int
  ),
  0,
  'Second quiz completion with identical input awards 0 incremental XP'
);

-- 4. User total XP remains 70 (no double-awarded XP)
SELECT extensions.is(
  (SELECT total_xp FROM public.users WHERE id = '77777777-7777-7777-7777-777777777777'::uuid),
  70,
  'User XP in public.users remains 70 (not double-awarded)'
);

RESET ROLE;

SELECT * FROM extensions.finish();

ROLLBACK;
