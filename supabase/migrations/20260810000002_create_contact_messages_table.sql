-- Migration: 20260810000002_create_contact_messages_table.sql
-- Description: Create contact_messages table for web contact form & inbound email query processing

CREATE TABLE IF NOT EXISTS public.contact_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  name text NOT NULL,
  email text NOT NULL,
  subject text NOT NULL,
  category text NOT NULL DEFAULT 'general', -- 'general' | 'curriculum' | 'bug' | 'billing' | 'partnership'
  message text NOT NULL,
  status text NOT NULL DEFAULT 'new',       -- 'new' | 'in_progress' | 'replied' | 'archived'
  source text NOT NULL DEFAULT 'web_form',   -- 'web_form' | 'inbound_email'
  admin_notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.contact_messages ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'contact_messages' AND policyname = 'Anyone can insert contact message') THEN
    CREATE POLICY "Anyone can insert contact message"
      ON public.contact_messages FOR INSERT
      TO public
      WITH CHECK (email IS NOT NULL AND length(trim(email)) > 3 AND length(trim(message)) > 0);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'contact_messages' AND policyname = 'Users can view own contact messages') THEN
    CREATE POLICY "Users can view own contact messages"
      ON public.contact_messages FOR SELECT
      TO authenticated
      USING (auth.uid() = user_id);
  END IF;
END $$;
