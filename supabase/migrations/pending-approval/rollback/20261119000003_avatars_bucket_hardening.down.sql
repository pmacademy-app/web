-- Rollback for 20261119000003: avatars bucket hardening (M5).
--
-- Restores the state 20260819000001_phase3_onboarding_storage.sql left behind:
--   * bucket "avatars" public with no allowed_mime_types and no file_size_limit (NULL means no
--     bucket-level limit; the project-wide upload limit still applies);
--   * the four storage.objects policies exactly as 20260819000001:24-59 created them.
--
-- Rolling back re-opens what the forward migration closed (any file type and size, direct learner
-- writes, bucket listing), so only do this to unblock an outage and re-apply after. The app does
-- not need the rollback: it writes and lists the bucket only through the service role. No object
-- is changed. Re-runnable.

SET search_path = public, pg_temp;

UPDATE storage.buckets
   SET public = true,
       file_size_limit = NULL,
       allowed_mime_types = NULL
 WHERE id = 'avatars';

DROP POLICY IF EXISTS "Public can view avatars" ON storage.objects;
CREATE POLICY "Public can view avatars" ON storage.objects
  FOR SELECT
  USING (bucket_id = 'avatars');

DROP POLICY IF EXISTS "Authenticated users can upload avatars" ON storage.objects;
CREATE POLICY "Authenticated users can upload avatars" ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'avatars'
    AND auth.role() = 'authenticated'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "Authenticated users can update avatars" ON storage.objects;
CREATE POLICY "Authenticated users can update avatars" ON storage.objects
  FOR UPDATE
  USING (
    bucket_id = 'avatars'
    AND auth.role() = 'authenticated'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "Authenticated users can delete avatars" ON storage.objects;
CREATE POLICY "Authenticated users can delete avatars" ON storage.objects
  FOR DELETE
  USING (
    bucket_id = 'avatars'
    AND auth.role() = 'authenticated'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
