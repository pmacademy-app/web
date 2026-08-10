-- Migration: 20260810000009_create_system_errors_and_rate_limits.sql
-- Description: Create dedicated public.system_errors and public.rate_limits tables for monitoring, alerts, and persistent rate-limiting.

-- 1. Create dedicated system_errors table for operational failure monitoring
CREATE TABLE IF NOT EXISTS public.system_errors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  timestamp TIMESTAMPTZ NOT NULL DEFAULT now(),
  severity TEXT NOT NULL CHECK (severity IN ('critical', 'error', 'warning')),
  category TEXT NOT NULL CHECK (category IN ('auth', 'verification', 'queue', 'resend', 'webhook', 'cron', 'system')),
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'acknowledged', 'resolved')),
  fingerprint TEXT NOT NULL,
  operation TEXT NOT NULL,
  template_key TEXT,
  queue_id UUID,
  resend_id TEXT,
  user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  message TEXT NOT NULL,
  details JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Create persistent rate_limits table for multi-region / cold-start rate limiting
CREATE TABLE IF NOT EXISTS public.rate_limits (
  key TEXT PRIMARY KEY,
  last_requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  count INT NOT NULL DEFAULT 1,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Create indexes for performance and rapid status/fingerprint lookup
CREATE INDEX IF NOT EXISTS idx_system_errors_status_severity ON public.system_errors (status, severity, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_system_errors_fingerprint_timestamp ON public.system_errors (fingerprint, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_rate_limits_key_last_requested ON public.rate_limits (key, last_requested_at DESC);

-- 4. Enable Row Level Security (RLS)
ALTER TABLE public.system_errors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;

-- 5. RLS Policies for system_errors (Admins can view and update status; Service role full access)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'system_errors' AND policyname = 'Admins can select system_errors') THEN
    CREATE POLICY "Admins can select system_errors"
      ON public.system_errors FOR SELECT
      USING (
        EXISTS (
          SELECT 1 FROM public.users
          WHERE users.id = auth.uid() AND users.is_admin = true
        )
      );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'system_errors' AND policyname = 'Admins can update system_errors') THEN
    CREATE POLICY "Admins can update system_errors"
      ON public.system_errors FOR UPDATE
      USING (
        EXISTS (
          SELECT 1 FROM public.users
          WHERE users.id = auth.uid() AND users.is_admin = true
        )
      );
  END IF;
END $$;
