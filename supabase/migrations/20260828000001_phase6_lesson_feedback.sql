-- PM Academy — Phase 6 Lesson Feedback Loop Migration
-- Migration: 20260828000001_phase6_lesson_feedback.sql
-- Adds lesson feedback columns, performance indexes, and update RLS policies to public.user_feedback

SET search_path TO public, extensions, auth;

-- 1. Add lesson_id, type, and tags columns to user_feedback table
ALTER TABLE IF EXISTS public.user_feedback
  ADD COLUMN IF NOT EXISTS lesson_id text,
  ADD COLUMN IF NOT EXISTS type text NOT NULL DEFAULT 'general',
  ADD COLUMN IF NOT EXISTS tags text[] DEFAULT '{}'::text[];

-- 2. Composite indexes for high-frequency curriculum quality queries
CREATE INDEX IF NOT EXISTS user_feedback_lesson_created_idx
  ON public.user_feedback (lesson_id, created_at);

CREATE INDEX IF NOT EXISTS user_feedback_user_lesson_created_idx
  ON public.user_feedback (user_id, lesson_id, created_at);

CREATE INDEX IF NOT EXISTS user_feedback_type_idx
  ON public.user_feedback (type);

-- 3. RLS: Allow authenticated users to update their own feedback (for 24h update idempotency)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'user_feedback' AND policyname = 'Users can update own feedback') THEN
    CREATE POLICY "Users can update own feedback"
      ON public.user_feedback FOR UPDATE
      TO authenticated
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;
