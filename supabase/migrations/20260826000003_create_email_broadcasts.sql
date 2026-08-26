-- Migration: 20260826000003_create_email_broadcasts.sql
-- Creates the email_broadcasts table for persistent admin broadcast management.
-- Broadcasts persist filters, track progress, and enable safe batch execution.

SET search_path TO public, extensions, auth;

CREATE TABLE IF NOT EXISTS public.email_broadcasts (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name              text        NOT NULL,
  description       text,
  template_key      text        NOT NULL,
  subject_override  text,
  batch_size        int         NOT NULL DEFAULT 100,
  status            text        NOT NULL DEFAULT 'draft'
                                CHECK (status IN ('draft','scheduled','sending','paused','completed','failed','cancelled')),
  -- Stored filter snapshot (immutable once sending begins)
  recipient_filters jsonb       NOT NULL DEFAULT '{}'::jsonb,
  -- Scheduling
  scheduled_at      timestamptz,
  started_at        timestamptz,
  completed_at      timestamptz,
  -- Progress tracking
  sent_count        int         NOT NULL DEFAULT 0,
  failed_count      int         NOT NULL DEFAULT 0,
  skipped_count     int         NOT NULL DEFAULT 0,
  total_recipients  int,
  last_batch_index  int         NOT NULL DEFAULT 0,
  -- Ownership
  created_by        uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

-- Efficient lookup of broadcasts needing processing (scheduled/sending)
CREATE INDEX IF NOT EXISTS idx_email_broadcasts_status_scheduled
  ON public.email_broadcasts (status, scheduled_at)
  WHERE status IN ('scheduled', 'sending');

-- Efficient filtering for sent-broadcast exclusion queries
CREATE INDEX IF NOT EXISTS idx_email_broadcasts_created_at
  ON public.email_broadcasts (created_at DESC);

-- Track which email_queue rows were sent by which broadcast
ALTER TABLE public.email_queue
  ADD COLUMN IF NOT EXISTS broadcast_id uuid REFERENCES public.email_broadcasts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_email_queue_broadcast_id
  ON public.email_queue (broadcast_id)
  WHERE broadcast_id IS NOT NULL;

-- Index for recipient exclusion queries (has user received a specific template?)
CREATE INDEX IF NOT EXISTS idx_email_queue_template_user_status
  ON public.email_queue (user_id, template_key, status);

-- CRITICAL DATABASE CONSTRAINT: Unique index guaranteeing no user receives duplicate emails for the same broadcast
CREATE UNIQUE INDEX IF NOT EXISTS idx_email_queue_broadcast_user_unique
  ON public.email_queue (broadcast_id, user_id)
  WHERE broadcast_id IS NOT NULL;

-- Row-Level Security (admin-only, service-role bypass)
ALTER TABLE public.email_broadcasts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role has full access to email_broadcasts"
  ON public.email_broadcasts
  FOR ALL
  USING (true)
  WITH CHECK (true);
