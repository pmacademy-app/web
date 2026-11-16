-- pgTAP tests for public.users Row Level Security and write guards (AG-05)
-- Verifies:
-- 1. Learner reads only their own profile row.
-- 2. Learner cannot read another user's private profile row.
-- 3. Learner cannot insert rows into public.users (revoked by 20261027000002_lock_public_users).
-- 4. Learner cannot update rows in public.users (revoked by 20261027000002_lock_public_users).
-- 5. Learner cannot delete rows from public.users (revoked by 20261027000002_lock_public_users).
-- 6. Trigger guard_privileged_user_columns prevents unprivileged modification of is_admin / xp / level.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

SELECT extensions.plan(6);

-- Seed two test users in auth.users and public.users
INSERT INTO auth.users (id, email, aud, role)
VALUES
  ('11111111-1111-1111-1111-111111111111'::uuid, 'learner_a@example.com', 'authenticated', 'authenticated'),
  ('22222222-2222-2222-2222-222222222222'::uuid, 'learner_b@example.com', 'authenticated', 'authenticated')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.users (id, email, name, is_admin, total_xp, level)
VALUES
  ('11111111-1111-1111-1111-111111111111'::uuid, 'learner_a@example.com', 'Learner A', false, 50, 1),
  ('22222222-2222-2222-2222-222222222222'::uuid, 'learner_b@example.com', 'Learner B', false, 100, 2)
ON CONFLICT (id) DO NOTHING;

-- Act as Learner A
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', '11111111-1111-1111-1111-111111111111', 'role', 'authenticated', 'email', 'learner_a@example.com')::text, true);

-- 1. Learner A can select own profile row
SELECT extensions.results_eq(
  $$ SELECT id, email FROM public.users WHERE id = '11111111-1111-1111-1111-111111111111'::uuid $$,
  $$ VALUES ('11111111-1111-1111-1111-111111111111'::uuid, 'learner_a@example.com'::text) $$,
  'Learner A can select own users row'
);

-- 2. Learner A cannot select Learner B private profile row
SELECT extensions.is(
  (SELECT count(*)::int FROM public.users WHERE id = '22222222-2222-2222-2222-222222222222'::uuid),
  0,
  'Learner A cannot select private users row of Learner B'
);

-- 3. Learner A cannot insert rows into public.users
SELECT extensions.throws_ok(
  $$ INSERT INTO public.users (id, email, name) VALUES (gen_random_uuid(), 'intruder@example.com', 'Intruder') $$,
  '42501',
  NULL,
  'Learner cannot insert into public.users'
);

-- 4. Learner A cannot update own row in public.users
SELECT extensions.throws_ok(
  $$ UPDATE public.users SET name = 'Hacked' WHERE id = '11111111-1111-1111-1111-111111111111'::uuid $$,
  '42501',
  NULL,
  'Learner cannot update public.users'
);

-- 5. Learner A cannot delete rows from public.users
SELECT extensions.throws_ok(
  $$ DELETE FROM public.users WHERE id = '11111111-1111-1111-1111-111111111111'::uuid $$,
  '42501',
  NULL,
  'Learner cannot delete from public.users'
);

-- Reset role to postgres to test trigger behavior directly
RESET ROLE;
SELECT set_config('request.jwt.claims', '', true);

-- 6. Trigger guard_privileged_user_columns blocks setting is_admin by unauthorized roles
-- Grant UPDATE and SELECT with temporary test policies to anon so the row is visible
-- under RLS and the trigger actually fires. Without a SELECT policy the WHERE clause
-- matches nothing (auth.uid() is NULL for anon), the update touches 0 rows, and no
-- exception is raised.
GRANT SELECT, UPDATE ON public.users TO anon;
CREATE POLICY test_anon_select ON public.users FOR SELECT TO anon USING (true);
CREATE POLICY test_anon_update ON public.users FOR UPDATE TO anon USING (true) WITH CHECK (true);
SET LOCAL ROLE anon;

SELECT extensions.throws_ok(
  $$ UPDATE public.users SET is_admin = true WHERE id = '11111111-1111-1111-1111-111111111111'::uuid $$,
  '42501',
  'privileged user columns can only be changed by the service',
  'guard_privileged_user_columns blocks non-admin role setting is_admin'
);

RESET ROLE;
DROP POLICY IF EXISTS test_anon_update ON public.users;
DROP POLICY IF EXISTS test_anon_select ON public.users;
REVOKE SELECT, UPDATE ON public.users FROM anon;

SELECT * FROM extensions.finish();

ROLLBACK;
