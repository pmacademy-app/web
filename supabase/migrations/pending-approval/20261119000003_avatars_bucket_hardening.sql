-- M5: the `avatars` storage bucket accepts only small images and no client writes or listing.
--
-- HELD IN pending-approval/. The Supabase CLI does not read this folder, so nothing here runs on
-- merge. The owner applies it by hand in the Supabase SQL editor.
--
-- Why (20260819000001_phase3_onboarding_storage.sql:18-59):
--   * The bucket is public with no allowed_mime_types and no file_size_limit, so anything that can
--     write to it can store any file type at any size on a public URL (HTML, SVG with script,
--     executables, large files that eat the free-tier storage quota).
--   * "Authenticated users can upload/update/delete avatars" let any signed-in learner write their
--     own folder directly with the anon key, skipping lib/avatar/avatar-service.ts, which is the
--     only place that checks type and size. The app never writes storage with a learner token:
--     uploadAndSetUserAvatar, the old-avatar cleanup, the orphan sweep and deleteAccount
--     (lib/settings/settings-service.ts) all use createServiceRoleClient(), which bypasses RLS.
--   * "Public can view avatars" is a SELECT policy on storage.objects for the whole bucket. A
--     public bucket serves /storage/v1/object/public/avatars/<path> without consulting RLS, so the
--     policy is not needed to show avatars; what it adds is the ability for anyone to LIST every
--     object name in the bucket (which are `<user id>/avatar-<timestamp>.<ext>`, so a list of user
--     ids). The app lists the bucket only with the service role (orphan sweep, deleteAccount).
--
-- This migration:
--   1. Sets file_size_limit = 2097152 (2 MB, MAX_AVATAR_SIZE_BYTES in avatar-service.ts) and
--      allowed_mime_types on the bucket. The list is image/png, image/jpeg, image/webp plus
--      image/jpg: ALLOWED_AVATAR_MIME_TYPES in avatar-service.ts accepts 'image/jpg' and forwards
--      the normalized type as the upload contentType unchanged, so leaving it out would turn a
--      browser that reports image/jpg into a failed upload. Drop it here once the service maps
--      image/jpg to image/jpeg. Storage enforces both limits for every caller, the service role
--      included.
--   2. Keeps the bucket public (avatar URLs stored in users.avatar_url keep working).
--   3. Drops the three learner write policies and the listing SELECT policy.
--
-- Idempotent: UPDATE to fixed values, DROP POLICY IF EXISTS and the self-check can all be re-run.
-- No object is moved or deleted. Nothing here grants anything to anon or authenticated.
-- Rollback: rollback/20261119000003_avatars_bucket_hardening.down.sql (next to this file).
-- Validation: validation/20261119000003_avatars_bucket_hardening_validation.sql.

SET search_path = public, pg_temp;

UPDATE storage.buckets
   SET public = true,
       file_size_limit = 2097152,
       allowed_mime_types = ARRAY['image/png', 'image/jpeg', 'image/webp', 'image/jpg']::text[]
 WHERE id = 'avatars';

DROP POLICY IF EXISTS "Authenticated users can upload avatars" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update avatars" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete avatars" ON storage.objects;
DROP POLICY IF EXISTS "Public can view avatars" ON storage.objects;

-- ---------------------------------------------------------------------------
-- Self-check
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_public boolean;
  v_limit bigint;
  v_types text[];
  v_policy text;
BEGIN
  SELECT public, file_size_limit, allowed_mime_types
    INTO v_public, v_limit, v_types
    FROM storage.buckets
   WHERE id = 'avatars';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'storage bucket "avatars" does not exist. 20260819000001 creates it; check the project before applying this.';
  END IF;

  IF v_public IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'bucket "avatars" is not public. Stored avatar URLs would stop resolving.';
  END IF;

  IF v_limit IS DISTINCT FROM 2097152 THEN
    RAISE EXCEPTION 'bucket "avatars" file_size_limit is %, expected 2097152.', v_limit;
  END IF;

  IF v_types IS NULL
     OR NOT (v_types @> ARRAY['image/png', 'image/jpeg', 'image/webp']::text[])
     OR NOT (v_types <@ ARRAY['image/png', 'image/jpeg', 'image/webp', 'image/jpg']::text[]) THEN
    RAISE EXCEPTION 'bucket "avatars" allowed_mime_types is %, expected only PNG, JPEG and WebP image types.', v_types;
  END IF;

  -- No policy on storage.objects may mention the avatars bucket any more: no client reads, lists
  -- or writes it. A future policy that does must come with its own migration and review.
  SELECT policyname INTO v_policy
    FROM pg_policies
   WHERE schemaname = 'storage'
     AND tablename = 'objects'
     AND (coalesce(qual, '') LIKE '%avatars%' OR coalesce(with_check, '') LIKE '%avatars%')
   LIMIT 1;
  IF v_policy IS NOT NULL THEN
    RAISE EXCEPTION 'storage.objects still has a policy that mentions the avatars bucket: "%".', v_policy;
  END IF;
END $$;
