-- Phase 2: In-App Notification Manager and Broadcasts
-- Creates in_app_broadcasts table for admin-managed in-app notification campaigns

CREATE TABLE IF NOT EXISTS public.in_app_broadcasts (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title               text NOT NULL,
  body                text NOT NULL,
  category            text NOT NULL DEFAULT 'announcement',
  priority            int NOT NULL DEFAULT 5, -- 1=critical/urgent, 2=high, 5=medium, 8=low
  action_url          text,
  audience            text NOT NULL DEFAULT 'all', -- 'all' | 'individual' | 'cohort' | 'filtered'
  target_user_id      uuid REFERENCES public.users(id) ON DELETE SET NULL,
  target_cohort_id    uuid REFERENCES public.cohorts(id) ON DELETE SET NULL,
  recipient_filters   jsonb NOT NULL DEFAULT '{}'::jsonb,
  status              text NOT NULL DEFAULT 'draft', -- 'draft' | 'scheduled' | 'sending' | 'completed' | 'paused' | 'cancelled' | 'failed'
  scheduled_at        timestamptz,
  sent_at             timestamptz,
  expires_at          timestamptz,
  total_targeted      int NOT NULL DEFAULT 0,
  total_delivered     int NOT NULL DEFAULT 0,
  total_read          int NOT NULL DEFAULT 0,
  created_by          uuid REFERENCES public.users(id) ON DELETE SET NULL,
  idempotency_key     text UNIQUE,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_in_app_broadcasts_status ON public.in_app_broadcasts(status);
CREATE INDEX IF NOT EXISTS idx_in_app_broadcasts_scheduled ON public.in_app_broadcasts(scheduled_at) WHERE status = 'scheduled';
CREATE INDEX IF NOT EXISTS idx_in_app_broadcasts_created_at ON public.in_app_broadcasts(created_at DESC);

-- Enable Row Level Security
ALTER TABLE public.in_app_broadcasts ENABLE ROW LEVEL SECURITY;

-- Admins can manage all in_app_broadcasts
CREATE POLICY "Admins manage in_app_broadcasts" ON public.in_app_broadcasts
  FOR ALL
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.users WHERE users.id = auth.uid() AND users.is_admin = true))
  WITH CHECK (EXISTS (SELECT 1 FROM public.users WHERE users.id = auth.uid() AND users.is_admin = true));
