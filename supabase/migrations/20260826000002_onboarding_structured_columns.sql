-- Migration: 20260826000002_onboarding_structured_columns.sql
-- Adds structured onboarding columns to users table for precise broadcast filtering.
-- The existing learning_purpose composite string is preserved for backward compatibility.

SET search_path TO public, extensions, auth;

-- 1. Add structured onboarding columns
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS onboarding_topics    text[]  NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS onboarding_preference text;

-- 2. Backfill onboarding_topics from existing learning_purpose composite string.
--    Format: "Interests: discovery, strategy | Preference: structured"
DO $$
DECLARE
  r RECORD;
  raw_interests text;
  interests_part text;
  pref_part text;
  topics_arr text[];
BEGIN
  FOR r IN SELECT id, learning_purpose FROM public.users WHERE learning_purpose IS NOT NULL AND learning_purpose != '' LOOP
    raw_interests := r.learning_purpose;
    topics_arr := '{}';

    -- Extract interests section
    IF raw_interests LIKE 'Interests: %' THEN
      -- Strip "Interests: " prefix; stop at " | " separator if present
      interests_part := substring(raw_interests from 'Interests: ([^|]+)');
      IF interests_part IS NOT NULL THEN
        interests_part := trim(interests_part);
        -- Split comma-separated topic IDs/labels into array
        topics_arr := string_to_array(interests_part, ', ');
        -- Trim each element
        topics_arr := ARRAY(SELECT trim(t) FROM unnest(topics_arr) AS t WHERE trim(t) != '');
      END IF;
    END IF;

    -- Extract preference section
    pref_part := NULL;
    IF raw_interests LIKE '%Preference: %' THEN
      pref_part := substring(raw_interests from 'Preference: (.+)$');
      IF pref_part IS NOT NULL THEN
        pref_part := trim(pref_part);
      END IF;
    END IF;

    UPDATE public.users
    SET
      onboarding_topics = topics_arr,
      onboarding_preference = pref_part
    WHERE id = r.id;
  END LOOP;
END $$;

-- 3. Index for efficient filtering on onboarding fields (GIN for arrays)
CREATE INDEX IF NOT EXISTS idx_users_onboarding_topics      ON public.users USING GIN (onboarding_topics);
CREATE INDEX IF NOT EXISTS idx_users_career_role            ON public.users (career_role) WHERE career_role IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_users_goal                   ON public.users (goal) WHERE goal IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_users_onboarding_completed   ON public.users (onboarding_completed);
CREATE INDEX IF NOT EXISTS idx_users_onboarding_preference  ON public.users (onboarding_preference) WHERE onboarding_preference IS NOT NULL;

-- 4. Indexes for activity/date filtering
CREATE INDEX IF NOT EXISTS idx_xp_events_user_created ON public.xp_events (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_lesson_progress_status ON public.user_lesson_progress (user_id, status);
