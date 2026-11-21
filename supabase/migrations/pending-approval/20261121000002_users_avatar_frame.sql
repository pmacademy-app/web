-- Avatar frames: the frame a learner chose to show around their avatar.
--
-- NULL means "automatic": the app shows the highest frame the learner has earned
-- (lib/avatar/frames.ts). A chosen frame the learner no longer holds (a lapsed streak,
-- last week's rank) also falls back to automatic in the app, so this column never makes
-- an untrue claim on its own. Written only by the server (learner writes to public.users
-- are revoked by 20261027000002), read with the learner's own row.
--
-- Additive, nullable, no data change, re-runnable, validates itself.

SET search_path = public, pg_temp;

ALTER TABLE public.users ADD COLUMN IF NOT EXISTS avatar_frame text;

ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_avatar_frame_check;
ALTER TABLE public.users ADD CONSTRAINT users_avatar_frame_check
  CHECK (avatar_frame IS NULL OR avatar_frame IN ('level', 'streak', 'verified', 'certified', 'top3', 'fellow'));

COMMENT ON COLUMN public.users.avatar_frame IS
  'Frame chosen in Settings; NULL = automatic (highest earned). The app falls back to automatic when the chosen frame is not currently earned.';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'avatar_frame'
  ) THEN
    RAISE EXCEPTION 'users.avatar_frame was not created.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'users_avatar_frame_check' AND conrelid = 'public.users'::regclass
  ) THEN
    RAISE EXCEPTION 'users_avatar_frame_check is missing.';
  END IF;
  IF has_table_privilege('authenticated', 'public.users', 'UPDATE')
     OR has_column_privilege('authenticated', 'public.users', 'avatar_frame', 'UPDATE') THEN
    RAISE EXCEPTION 'authenticated can write public.users. Apply 20261027000002_lock_public_users.sql first.';
  END IF;
END $$;
