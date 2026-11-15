-- pgTAP tests for public.in_app_notifications Row Level Security and column grants (AG-05)
-- Verifies:
-- 1. Learner can select own notifications.
-- 2. Learner cannot select another learner's notifications.
-- 3. Learner can update is_read and read_at on own notification (20261013000002_restrict_in_app_notification_updates).
-- 4. Learner cannot update another learner's notification.
-- 5. Learner cannot update disallowed columns (e.g. title) on own notification (throws 42501).

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

SELECT extensions.plan(5);

-- Seed two test users in auth.users and public.users
INSERT INTO auth.users (id, email, aud, role)
VALUES
  ('55555555-5555-5555-5555-555555555555'::uuid, 'learner_e@example.com', 'authenticated', 'authenticated'),
  ('66666666-6666-6666-6666-666666666666'::uuid, 'learner_f@example.com', 'authenticated', 'authenticated')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.users (id, email, name)
VALUES
  ('55555555-5555-5555-5555-555555555555'::uuid, 'learner_e@example.com', 'Learner E'),
  ('66666666-6666-6666-6666-666666666666'::uuid, 'learner_f@example.com', 'Learner F')
ON CONFLICT (id) DO NOTHING;

-- Seed notifications
INSERT INTO public.in_app_notifications (id, user_id, category, title, body, is_read)
VALUES
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'::uuid, '55555555-5555-5555-5555-555555555555'::uuid, 'announcement', 'Notice E', 'Body E', false),
  ('ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid, '66666666-6666-6666-6666-666666666666'::uuid, 'announcement', 'Notice F', 'Body F', false)
ON CONFLICT (id) DO NOTHING;

-- Act as Learner E
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', '55555555-5555-5555-5555-555555555555', 'role', 'authenticated', 'email', 'learner_e@example.com')::text, true);

-- 1. Learner E can select own notification
SELECT extensions.is(
  (SELECT count(*)::int FROM public.in_app_notifications WHERE user_id = '55555555-5555-5555-5555-555555555555'::uuid),
  1,
  'Learner E can select own in-app notifications'
);

-- 2. Learner E cannot select Learner F notification
SELECT extensions.is(
  (SELECT count(*)::int FROM public.in_app_notifications WHERE user_id = '66666666-6666-6666-6666-666666666666'::uuid),
  0,
  'Learner E cannot select Learner F in-app notifications'
);

-- 3. Learner E can update allowed columns (is_read, read_at) on own notification
SELECT extensions.lives_ok(
  $$ UPDATE public.in_app_notifications SET is_read = true, read_at = now() WHERE id = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'::uuid $$,
  'Learner E can update is_read and read_at on own notification'
);

-- 4. Learner E cannot update Learner F notification (affects 0 rows due to RLS)
SELECT extensions.is(
  (
    WITH updated AS (
      UPDATE public.in_app_notifications SET is_read = true WHERE id = 'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid RETURNING id
    )
    SELECT count(*)::int FROM updated
  ),
  0,
  'Learner E cannot update notification belonging to Learner F'
);

-- 5. Learner E cannot update disallowed column (e.g. title) on own notification (throws 42501 column privilege error)
SELECT extensions.throws_ok(
  $$ UPDATE public.in_app_notifications SET title = 'Altered' WHERE id = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'::uuid $$,
  '42501',
  NULL,
  'Learner E cannot update title column on in-app notifications'
);

RESET ROLE;

SELECT * FROM extensions.finish();

ROLLBACK;
