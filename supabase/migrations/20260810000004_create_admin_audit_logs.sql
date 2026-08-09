-- Migration: 20260810000004_create_admin_audit_logs.sql
-- Description: Create admin_audit_logs table for secure operational action logging

CREATE TABLE IF NOT EXISTS public.admin_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  admin_email text NOT NULL,
  action text NOT NULL,
  target_resource text NOT NULL,
  target_id text,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.admin_audit_logs ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'admin_audit_logs' AND policyname = 'Admins can read audit logs') THEN
    CREATE POLICY "Admins can read audit logs"
      ON public.admin_audit_logs FOR SELECT
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM public.users WHERE id = auth.uid() AND is_admin = true
        )
      );
  END IF;
END $$;
