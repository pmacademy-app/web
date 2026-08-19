-- PM Academy — Phase 3 Onboarding & Storage
-- Migration: 20260819000001_phase3_onboarding_storage.sql

SET search_path TO public, extensions, auth;

-- 1. Schema Expansion
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS career_role text,
  ADD COLUMN IF NOT EXISTS learning_purpose text,
  ADD COLUMN IF NOT EXISTS onboarding_completed boolean NOT NULL DEFAULT false;

-- The 'goal' column already exists in 20260728000002_create_user_state.sql, 
-- but learning_purpose might supersede it. We'll add it anyway.

-- 2. Avatars Storage Bucket
-- Ensure the storage extension and bucket exist. 
-- In Supabase, the storage schema is managed internally, but we can insert into storage.buckets
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- 3. Storage RLS Policies
-- Allow anyone to read avatars
CREATE POLICY "Public can view avatars" ON storage.objects
  FOR SELECT
  USING (bucket_id = 'avatars');

-- Allow authenticated users to insert their own avatars
CREATE POLICY "Authenticated users can upload avatars" ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'avatars' 
    AND auth.role() = 'authenticated'
    -- Ensure they only upload to a folder matching their user ID (or a predictable path)
    -- e.g. path format: {user_id}/{filename}
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Allow authenticated users to update their own avatars
CREATE POLICY "Authenticated users can update avatars" ON storage.objects
  FOR UPDATE
  USING (
    bucket_id = 'avatars' 
    AND auth.role() = 'authenticated'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Allow authenticated users to delete their own avatars
CREATE POLICY "Authenticated users can delete avatars" ON storage.objects
  FOR DELETE
  USING (
    bucket_id = 'avatars' 
    AND auth.role() = 'authenticated'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
