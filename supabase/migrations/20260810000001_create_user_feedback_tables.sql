-- Migration: 20260810000001_create_user_feedback_tables.sql
-- Description: Create private user_feedback & server-authoritative user_feedback_prompts tables, add total_active_seconds to users

-- 1. Add total_active_seconds to users for server-authoritative 1hr site usage measurement
ALTER TABLE IF EXISTS public.users ADD COLUMN IF NOT EXISTS total_active_seconds integer DEFAULT 0 NOT NULL;

-- 2. Create user_feedback table for private product feedback (suggestions, bug reports, feature requests)
CREATE TABLE IF NOT EXISTS public.user_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES public.users(id) ON DELETE CASCADE,
  category text NOT NULL DEFAULT 'general', -- 'bug' | 'feature' | 'curriculum' | 'general'
  source_event text NOT NULL,               -- 'module_completion' | 'capstone_submission' | 'usage_1hr' | 'manual'
  content text NOT NULL,
  rating integer CHECK (rating BETWEEN 1 AND 5),
  page_url text,
  status text NOT NULL DEFAULT 'new',       -- 'new' | 'reviewed' | 'archived'
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_feedback ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'user_feedback' AND policyname = 'Users can insert own feedback') THEN
    CREATE POLICY "Users can insert own feedback"
      ON public.user_feedback FOR INSERT
      TO authenticated
      WITH CHECK (auth.uid() = user_id OR user_id IS NULL);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'user_feedback' AND policyname = 'Users can view own feedback') THEN
    CREATE POLICY "Users can view own feedback"
      ON public.user_feedback FOR SELECT
      TO authenticated
      USING (auth.uid() = user_id);
  END IF;
END $$;

-- 3. Create user_feedback_prompts table to prevent duplicate milestone prompts per user across devices/tabs
CREATE TABLE IF NOT EXISTS public.user_feedback_prompts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
  prompt_key text NOT NULL, -- 'module_1' .. 'module_9' | 'capstone_1' .. 'capstone_9' | 'usage_1hr'
  action text NOT NULL,     -- 'submitted' | 'dismissed'
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_feedback_prompts_user_prompt_unique UNIQUE (user_id, prompt_key)
);

ALTER TABLE public.user_feedback_prompts ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'user_feedback_prompts' AND policyname = 'Users can manage own feedback prompts') THEN
    CREATE POLICY "Users can manage own feedback prompts"
      ON public.user_feedback_prompts FOR ALL
      TO authenticated
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;
