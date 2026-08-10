-- Migration: 20260810000008_email_automations_and_limits.sql
-- Persistent Email Automation & Delivery System Database Layer
-- Creates atomic queue claiming RPC, post-acceptance daily quota function, and seeds automation settings.

SET search_path TO public, extensions, auth;

-- 1. Ensure skipped_reason column exists on email_queue & notification_events
ALTER TABLE public.email_queue
ADD COLUMN IF NOT EXISTS skipped_reason text;

ALTER TABLE public.notification_events
ADD COLUMN IF NOT EXISTS skipped_reason text;

-- 2. Seed Default System Settings for Automations, Global Pause & Daily Send Limit
INSERT INTO public.system_settings (key, value, updated_at)
VALUES 
  ('email_global_pause', '{"enabled": false}'::jsonb, NOW()),
  ('email_daily_send_limit', '{"limit": 100}'::jsonb, NOW()),
  ('email_automations', '{
    "auth.welcome": true,
    "auth.verify_email": true,
    "auth.password_reset": true,
    "learning.module_complete": true,
    "achievement.badge_earned": true,
    "achievement.level_up": true,
    "achievement.certificate": true,
    "achievement.portfolio_published": true,
    "learning.weekly_recap": true,
    "learning.daily_reminder": true,
    "inactive.resume_learning": false
  }'::jsonb, NOW())
ON CONFLICT (key) DO NOTHING;

-- 3. Atomic PostgreSQL Queue Claiming Function (FOR UPDATE SKIP LOCKED)
CREATE OR REPLACE FUNCTION public.claim_email_queue_items(p_batch_size int)
RETURNS SETOF public.email_queue AS $$
BEGIN
  RETURN QUERY
  WITH target AS (
    SELECT id FROM public.email_queue
    WHERE status IN ('pending', 'retrying')
      AND scheduled_at <= NOW()
      AND (next_retry_at IS NULL OR next_retry_at <= NOW())
    ORDER BY priority ASC, scheduled_at ASC
    LIMIT p_batch_size
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.email_queue q
  SET status = 'processing',
      processing_at = NOW(),
      attempt_count = q.attempt_count + 1,
      updated_at = NOW()
  FROM target
  WHERE q.id = target.id
  RETURNING q.*;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Single-Statement Atomic Daily Quota Increment Function (Post-Resend Acceptance Only)
CREATE OR REPLACE FUNCTION public.increment_daily_email_quota(p_limit int)
RETURNS boolean AS $$
DECLARE
  today_key text := 'email_sent_count_' || TO_CHAR(NOW(), 'YYYY_MM_DD');
  updated_count int;
BEGIN
  INSERT INTO public.system_settings (key, value, updated_at)
  VALUES (today_key, jsonb_build_object('count', 1), NOW())
  ON CONFLICT (key) DO UPDATE
    SET value = jsonb_build_object('count', (public.system_settings.value->>'count')::int + 1),
        updated_at = NOW()
    WHERE (public.system_settings.value->>'count')::int < p_limit
  RETURNING (value->>'count')::int INTO updated_count;

  RETURN updated_count IS NOT NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Helper Function to Get Current Daily Sent Email Count
CREATE OR REPLACE FUNCTION public.get_current_daily_email_count()
RETURNS int AS $$
DECLARE
  today_key text := 'email_sent_count_' || TO_CHAR(NOW(), 'YYYY_MM_DD');
  current_count int := 0;
BEGIN
  SELECT (value->>'count')::int INTO current_count
  FROM public.system_settings
  WHERE key = today_key;

  RETURN COALESCE(current_count, 0);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;
