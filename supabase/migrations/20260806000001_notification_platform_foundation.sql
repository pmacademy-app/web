-- Phase 3 Sprint 6.1: Notification Platform Foundation Database Migration
-- Creates core user preference, event log, email queue, in-app notification, deliverability, and flag tables

-- 1. Users table extension (is_admin flag for Admin Console)
ALTER TABLE public.users
ADD COLUMN IF NOT EXISTS is_admin boolean NOT NULL DEFAULT false;

-- 2. User Notification Preferences
CREATE TABLE IF NOT EXISTS public.user_notification_preferences (
  user_id                       uuid PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  all_notifications             boolean NOT NULL DEFAULT true,
  all_email                     boolean NOT NULL DEFAULT true,
  all_in_app                    boolean NOT NULL DEFAULT true,
  
  -- Category channel toggles
  security_email                boolean NOT NULL DEFAULT true,
  security_in_app               boolean NOT NULL DEFAULT true,
  learning_email                boolean NOT NULL DEFAULT true,
  learning_in_app               boolean NOT NULL DEFAULT true,
  achievements_email            boolean NOT NULL DEFAULT true,
  achievements_in_app           boolean NOT NULL DEFAULT true,
  portfolio_email               boolean NOT NULL DEFAULT true,
  portfolio_in_app              boolean NOT NULL DEFAULT true,
  certificates_email           boolean NOT NULL DEFAULT true,
  certificates_in_app          boolean NOT NULL DEFAULT true,
  product_updates_email         boolean NOT NULL DEFAULT true,
  product_updates_in_app        boolean NOT NULL DEFAULT true,
  marketing_email               boolean NOT NULL DEFAULT false, -- explicit opt-in only
  marketing_in_app              boolean NOT NULL DEFAULT false,
  
  preferred_reminder_hour       int NOT NULL DEFAULT 9,
  timezone                      text NOT NULL DEFAULT 'UTC',
  unsubscribe_token             text UNIQUE DEFAULT gen_random_uuid()::text,
  updated_at                    timestamptz NOT NULL DEFAULT now()
);

-- 3. Notification Events Log (Source of Truth)
CREATE TABLE IF NOT EXISTS public.notification_events (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type        text NOT NULL,
  user_id           uuid REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
  payload           jsonb NOT NULL DEFAULT '{}'::jsonb,
  channels_notified text[] NOT NULL DEFAULT '{}'::text[],
  skipped_reason    text,
  created_at        timestamptz NOT NULL DEFAULT now()
);

-- 4. Email Queue & Dead Letter Queue
CREATE TABLE IF NOT EXISTS public.email_queue (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
  to_email          text NOT NULL,
  to_name           text,
  template_key      text NOT NULL,
  template_variables jsonb NOT NULL DEFAULT '{}'::jsonb,
  event_id          uuid REFERENCES public.notification_events(id) ON DELETE SET NULL,
  event_type        text NOT NULL,
  priority          int NOT NULL DEFAULT 5,
  status            text NOT NULL DEFAULT 'pending',
  attempt_count     int NOT NULL DEFAULT 0,
  max_attempts      int NOT NULL DEFAULT 3,
  scheduled_at      timestamptz NOT NULL DEFAULT now(),
  next_retry_at     timestamptz,
  processing_at     timestamptz,
  delivered_at      timestamptz,
  failed_at         timestamptz,
  resend_id         text,
  error_message     text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.email_dead_letter (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  original_queue_id uuid REFERENCES public.email_queue(id) ON DELETE CASCADE,
  user_id           uuid REFERENCES public.users(id) ON DELETE CASCADE,
  template_key      text NOT NULL,
  template_variables jsonb NOT NULL DEFAULT '{}'::jsonb,
  failure_reason    text,
  all_errors        jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at        timestamptz NOT NULL DEFAULT now()
);

-- 5. In-App Notifications
CREATE TABLE IF NOT EXISTS public.in_app_notifications (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
  event_id      uuid REFERENCES public.notification_events(id) ON DELETE SET NULL,
  category      text NOT NULL,
  title         text NOT NULL,
  body          text NOT NULL,
  action_url    text,
  priority      int NOT NULL DEFAULT 5,
  is_read       boolean NOT NULL DEFAULT false,
  read_at       timestamptz,
  expires_at    timestamptz NOT NULL DEFAULT (now() + interval '45 days'),
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- 6. Email Delivery Events & Suppressions
CREATE TABLE IF NOT EXISTS public.email_delivery_events (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email_queue_id uuid REFERENCES public.email_queue(id) ON DELETE CASCADE,
  resend_id      text,
  event_type     text NOT NULL,
  metadata       jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.email_suppressions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email         text UNIQUE NOT NULL,
  reason        text NOT NULL,
  suppressed_at timestamptz NOT NULL DEFAULT now(),
  expires_at    timestamptz
);

-- 7. Notification Feature Flags
CREATE TABLE IF NOT EXISTS public.notification_feature_flags (
  key           text PRIMARY KEY,
  description   text,
  enabled       boolean NOT NULL DEFAULT true,
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- 8. Template Metadata & Versions
CREATE TABLE IF NOT EXISTS public.notification_templates (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_key      text UNIQUE NOT NULL,
  category          text NOT NULL,
  current_version   int NOT NULL DEFAULT 1,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.notification_template_versions (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id       uuid REFERENCES public.notification_templates(id) ON DELETE CASCADE,
  version           int NOT NULL,
  subject_line      text NOT NULL,
  body_text         text NOT NULL,
  body_html         text NOT NULL,
  status            text NOT NULL DEFAULT 'draft',
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (template_id, version)
);

-- 9. User Notification Timeline
CREATE TABLE IF NOT EXISTS public.user_notification_timeline (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
  event_id          uuid REFERENCES public.notification_events(id) ON DELETE SET NULL,
  channel           text NOT NULL,
  template_key      text NOT NULL,
  template_version  int NOT NULL DEFAULT 1,
  status            text NOT NULL,
  priority          int NOT NULL DEFAULT 5,
  queued_at         timestamptz NOT NULL DEFAULT now(),
  sent_at           timestamptz,
  delivered_at      timestamptz,
  opened_at         timestamptz,
  clicked_at        timestamptz,
  failed_at         timestamptz,
  suppressed_at     timestamptz,
  error_details     text,
  resend_id         text,
  metadata          jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at        timestamptz NOT NULL DEFAULT now()
);

-- 10. System Settings (Key-Value)
CREATE TABLE IF NOT EXISTS public.system_settings (
  key         text PRIMARY KEY,
  value       jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- 11. Indexes for Performance
CREATE INDEX IF NOT EXISTS idx_email_queue_status_scheduled
  ON public.email_queue (status, scheduled_at)
  WHERE status IN ('pending', 'failed');

CREATE INDEX IF NOT EXISTS idx_email_queue_user_id ON public.email_queue (user_id);
CREATE INDEX IF NOT EXISTS idx_in_app_notifications_user_unread ON public.in_app_notifications (user_id, is_read);
CREATE INDEX IF NOT EXISTS idx_notification_events_user_id ON public.notification_events (user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_user_timeline_user ON public.user_notification_timeline (user_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_suppressions_email ON public.email_suppressions (email);

-- 12. Row Level Security Policies
ALTER TABLE public.user_notification_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.in_app_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_notification_timeline ENABLE ROW LEVEL SECURITY;

-- Preferences: user can read/write their own
CREATE POLICY "Users can read own preferences"
  ON public.user_notification_preferences FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own preferences"
  ON public.user_notification_preferences FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own preferences"
  ON public.user_notification_preferences FOR UPDATE
  USING (auth.uid() = user_id);

-- In-App Notifications: user can read/update own (e.g. mark read)
CREATE POLICY "Users can read own in-app notifications"
  ON public.in_app_notifications FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update own in-app notifications"
  ON public.in_app_notifications FOR UPDATE
  USING (auth.uid() = user_id);

-- Timeline: user can read own timeline entries
CREATE POLICY "Users can read own timeline"
  ON public.user_notification_timeline FOR SELECT
  USING (auth.uid() = user_id);
