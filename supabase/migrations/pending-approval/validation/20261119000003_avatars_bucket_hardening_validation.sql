-- Validation for 20261119000003: avatars bucket hardening (M5).
--
-- Read-only. Runs inside one transaction and rolls back; it only reads storage.buckets and the
-- policy catalog. Run in the Supabase SQL editor (or psql) as postgres after applying the
-- migration. Every check raises on failure. Success prints "20261119000003 validation passed".
--
-- Manual follow-up (not SQL): upload an avatar through the app settings page, confirm the image
-- shows on the profile and on the public portfolio, then request
-- https://<project>.supabase.co/storage/v1/object/list/avatars with only the anon key and confirm
-- it returns an empty list.

BEGIN;

DO $$
DECLARE
  v_bucket record;
  v_count int;
BEGIN
  SELECT id, public, file_size_limit, allowed_mime_types
    INTO v_bucket
    FROM storage.buckets
   WHERE id = 'avatars';

  IF NOT FOUND THEN
    RAISE EXCEPTION '20261119000003 FAILED: bucket "avatars" is missing';
  END IF;
  IF v_bucket.public IS DISTINCT FROM true THEN
    RAISE EXCEPTION '20261119000003 FAILED: bucket "avatars" is not public';
  END IF;
  IF v_bucket.file_size_limit IS DISTINCT FROM 2097152 THEN
    RAISE EXCEPTION '20261119000003 FAILED: file_size_limit is %, expected 2097152', v_bucket.file_size_limit;
  END IF;
  IF v_bucket.allowed_mime_types IS NULL
     OR NOT (v_bucket.allowed_mime_types @> ARRAY['image/png', 'image/jpeg', 'image/webp']::text[])
     OR NOT (v_bucket.allowed_mime_types <@ ARRAY['image/png', 'image/jpeg', 'image/webp', 'image/jpg']::text[]) THEN
    RAISE EXCEPTION '20261119000003 FAILED: allowed_mime_types is %', v_bucket.allowed_mime_types;
  END IF;

  SELECT count(*) INTO v_count
    FROM pg_policies
   WHERE schemaname = 'storage'
     AND tablename = 'objects'
     AND policyname IN (
       'Public can view avatars',
       'Authenticated users can upload avatars',
       'Authenticated users can update avatars',
       'Authenticated users can delete avatars'
     );
  IF v_count <> 0 THEN
    RAISE EXCEPTION '20261119000003 FAILED: % avatars policy(ies) still present on storage.objects', v_count;
  END IF;

  SELECT count(*) INTO v_count
    FROM pg_policies
   WHERE schemaname = 'storage'
     AND tablename = 'objects'
     AND (coalesce(qual, '') LIKE '%avatars%' OR coalesce(with_check, '') LIKE '%avatars%');
  IF v_count <> 0 THEN
    RAISE EXCEPTION '20261119000003 FAILED: % other storage.objects policy(ies) mention the avatars bucket', v_count;
  END IF;

  RAISE NOTICE '20261119000003 validation passed';
END $$;

SELECT id, public, file_size_limit, allowed_mime_types
  FROM storage.buckets
 WHERE id = 'avatars';

ROLLBACK;
