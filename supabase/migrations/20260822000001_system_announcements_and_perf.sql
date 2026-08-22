-- Migration: 20260822000001_system_announcements_and_perf.sql
-- Description: System announcements, dismissals, dashboard SQL aggregation RPCs, and performance indexes.

-- 1. System Announcements Table
CREATE TABLE IF NOT EXISTS public.system_announcements (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title             text NOT NULL,
  content           text NOT NULL,
  type              text NOT NULL DEFAULT 'info' CHECK (type IN ('info', 'warning', 'critical', 'success')),
  status            text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'scheduled', 'active', 'paused', 'expired')),
  target_audience   text NOT NULL DEFAULT 'all' CHECK (target_audience IN ('all', 'cohort', 'individual')),
  target_cohort_id  text,
  target_user_id    uuid REFERENCES public.users(id) ON DELETE CASCADE,
  link_url          text,
  link_text         text,
  scheduled_at      timestamptz,
  published_at      timestamptz,
  expires_at        timestamptz,
  dismissible       boolean NOT NULL DEFAULT true,
  priority          int NOT NULL DEFAULT 1,
  created_by        uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

-- 2. User Announcement Dismissals
CREATE TABLE IF NOT EXISTS public.user_announcement_dismissals (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
  announcement_id   uuid REFERENCES public.system_announcements(id) ON DELETE CASCADE NOT NULL,
  dismissed_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, announcement_id)
);

-- 3. Indexes for Fast Lookups
CREATE INDEX IF NOT EXISTS idx_announcements_lookup 
  ON public.system_announcements (status, scheduled_at, expires_at);

CREATE INDEX IF NOT EXISTS idx_announcements_target_user 
  ON public.system_announcements (target_user_id) 
  WHERE target_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_announcements_target_cohort 
  ON public.system_announcements (target_cohort_id) 
  WHERE target_cohort_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_announcement_dismissals_user 
  ON public.user_announcement_dismissals (user_id, announcement_id);

-- Performance Indexes on Hot Tables
CREATE INDEX IF NOT EXISTS idx_xp_events_user_created 
  ON public.xp_events (user_id, created_at);

CREATE INDEX IF NOT EXISTS idx_xp_events_created 
  ON public.xp_events (created_at);

CREATE INDEX IF NOT EXISTS idx_user_lesson_progress_status_completed 
  ON public.user_lesson_progress (status, completed_at) 
  WHERE status = 'completed';

CREATE INDEX IF NOT EXISTS idx_user_lesson_progress_user_status 
  ON public.user_lesson_progress (user_id, status);

CREATE INDEX IF NOT EXISTS idx_quiz_attempts_user_attempted 
  ON public.quiz_attempts (user_id, attempted_at);

CREATE INDEX IF NOT EXISTS idx_capstones_user_submitted 
  ON public.capstone_submissions (user_id, submitted_at);

CREATE INDEX IF NOT EXISTS idx_audit_logs_action_created 
  ON public.admin_audit_logs (action, created_at);

-- 4. Enable RLS
ALTER TABLE public.system_announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_announcement_dismissals ENABLE ROW LEVEL SECURITY;

-- 5. RLS Policies: system_announcements
-- Active non-expired announcements can be read by any authenticated user or public
DROP POLICY IF EXISTS "Active announcements viewable by all" ON public.system_announcements;
CREATE POLICY "Active announcements viewable by all"
  ON public.system_announcements
  FOR SELECT
  USING (
    status = 'active'
    AND (scheduled_at IS NULL OR scheduled_at <= now())
    AND (expires_at IS NULL OR expires_at > now())
  );

-- Admins / Service Role full access
DROP POLICY IF EXISTS "Admins manage announcements" ON public.system_announcements;
CREATE POLICY "Admins manage announcements"
  ON public.system_announcements
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.is_admin = true
    )
  );

-- 6. RLS Policies: user_announcement_dismissals
DROP POLICY IF EXISTS "Users manage own dismissals" ON public.user_announcement_dismissals;
CREATE POLICY "Users manage own dismissals"
  ON public.user_announcement_dismissals
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 7. SQL Aggregation RPC: get_admin_dashboard_summary
CREATE OR REPLACE FUNCTION public.get_admin_dashboard_summary()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total_users bigint;
  v_new_signups_24h bigint;
  v_total_lessons_completed bigint;
  v_total_capstones_submitted bigint;
  v_total_certificates_issued bigint;
  v_total_public_portfolios bigint;
  v_total_xp_awarded bigint;
  v_active_learners_7d bigint;
BEGIN
  SELECT COUNT(*) INTO v_total_users FROM public.users;
  SELECT COUNT(*) INTO v_new_signups_24h FROM public.users WHERE created_at >= (now() - interval '24 hours');
  SELECT COUNT(*) INTO v_total_lessons_completed FROM public.user_lesson_progress WHERE status = 'completed';
  SELECT COUNT(*) INTO v_total_capstones_submitted FROM public.capstone_submissions;
  SELECT COUNT(*) INTO v_total_certificates_issued FROM public.certificates;
  SELECT COUNT(*) INTO v_total_public_portfolios FROM public.users WHERE is_portfolio_public = true;
  SELECT COALESCE(SUM(xp_amount), 0) INTO v_total_xp_awarded FROM public.xp_events;
  SELECT COUNT(DISTINCT user_id) INTO v_active_learners_7d FROM public.xp_events WHERE created_at >= (now() - interval '7 days') AND user_id IS NOT NULL;

  RETURN json_build_object(
    'totalUsers', v_total_users,
    'newSignups24h', v_new_signups_24h,
    'totalLessonsCompleted', v_total_lessons_completed,
    'totalCapstonesSubmitted', v_total_capstones_submitted,
    'totalCertificatesIssued', v_total_certificates_issued,
    'totalPublicPortfolios', v_total_public_portfolios,
    'totalXpAwarded', v_total_xp_awarded,
    'activeLearners7d', v_active_learners_7d
  );
END;
$$;
