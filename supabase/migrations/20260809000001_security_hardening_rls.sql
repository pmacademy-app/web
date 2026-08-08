-- Migration: 20260809000001_security_hardening_rls.sql
-- Description: Sprint 7.5 Security Audit — Enable RLS on all remaining notification, queue, and system tables

-- 1. Enable RLS on notification events log (user-owned)
ALTER TABLE IF EXISTS public.notification_events ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF to_regclass('public.notification_events') IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'notification_events' AND policyname = 'Users can read own notification events') THEN
      CREATE POLICY "Users can read own notification events"
        ON public.notification_events FOR SELECT
        USING (auth.uid() = user_id);
    END IF;
  END IF;
END $$;

-- 2. Enable RLS on email queue (user-owned)
ALTER TABLE IF EXISTS public.email_queue ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF to_regclass('public.email_queue') IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'email_queue' AND policyname = 'Users can read own queued emails') THEN
      CREATE POLICY "Users can read own queued emails"
        ON public.email_queue FOR SELECT
        USING (auth.uid() = user_id);
    END IF;
  END IF;
END $$;

-- 3. Enable RLS on email suppressions
ALTER TABLE IF EXISTS public.email_suppressions ENABLE ROW LEVEL SECURITY;

-- 4. Enable RLS on system tables (Admin / Service Role read-only for public/authenticated)
ALTER TABLE IF EXISTS public.notification_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.notification_template_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.system_settings ENABLE ROW LEVEL SECURITY;
