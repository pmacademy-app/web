-- Rollback for 20261112000001: re-create public.waitlist (structure only).
--
-- THE ROWS ARE NOT RESTORED. This brings back an empty table with the shape it had just before
-- the drop. To get the data back, re-import the CSV the owner exported before applying the
-- forward migration (Table Editor import, or COPY from psql).
--
-- Run it by hand in the Supabase SQL editor, as postgres. Safe to re-run.
--
-- Final pre-drop state, rebuilt from every migration that touched the table:
--   20260728000001_create_waitlist.sql            table, indexes, RLS, the two original policies
--   20260728000003_alter_waitlist_column.sql      current_role renamed to career_position (the
--                                                 create already uses the new name, so no-op here)
--   20260728164000_supabase_security_hardening.sql table comment
--   20260810000007_supabase_advisor_security_hardening.sql
--                                                 "Anyone can join waitlist" replaced by
--                                                 "Anyone can join waitlist with valid fields"
--
-- Grants: no migration ever granted or revoked anything on public.waitlist by name, so it held
-- Supabase's default table privileges. Re-creating the table as postgres applies the same
-- defaults, so no GRANT is issued here. RLS stays on: anon and authenticated can only INSERT a
-- row that passes the policy check, and nobody but service_role can read.
--
-- Note: the /api/waitlist route was removed with the forward change, so nothing in the app writes
-- here after a rollback unless that route is restored too.

SET search_path = public, pg_temp;

CREATE TABLE IF NOT EXISTS public.waitlist (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name              text NOT NULL,
  email             text UNIQUE NOT NULL,
  "career_position" text NOT NULL,
  source            text NOT NULL DEFAULT 'direct',
  utm_source        text,
  utm_medium        text,
  utm_campaign      text,
  referrer          text,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS waitlist_email_idx ON public.waitlist (email);
CREATE INDEX IF NOT EXISTS waitlist_created_at_idx ON public.waitlist (created_at DESC);

ALTER TABLE public.waitlist ENABLE ROW LEVEL SECURITY;

-- The original permissive insert policy was replaced in 20260810000007; make sure it is gone.
DROP POLICY IF EXISTS "Anyone can join waitlist" ON public.waitlist;

DROP POLICY IF EXISTS "Anyone can join waitlist with valid fields" ON public.waitlist;
CREATE POLICY "Anyone can join waitlist with valid fields"
  ON public.waitlist FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    length(trim(email)) >= 5 AND
    length(email) <= 255 AND
    email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$' AND
    length(trim(name)) >= 1 AND
    length(name) <= 100 AND
    length(trim(career_position)) >= 1 AND
    length(career_position) <= 100
  );

DROP POLICY IF EXISTS "No public read on waitlist" ON public.waitlist;
CREATE POLICY "No public read on waitlist"
  ON public.waitlist
  FOR SELECT
  TO anon
  USING (false);

COMMENT ON TABLE public.waitlist IS 'Waitlist pre-signup database. Permissive RLS insert is required for anonymous registration; input validation is handled by API route.';

-- Self-check: the table is back with RLS on and both policies present.
DO $$
BEGIN
  IF to_regclass('public.waitlist') IS NULL THEN
    RAISE EXCEPTION 'public.waitlist was not re-created.';
  END IF;

  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.waitlist'::regclass) THEN
    RAISE EXCEPTION 'RLS is not enabled on public.waitlist.';
  END IF;

  IF (
    SELECT count(*) FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'waitlist'
      AND policyname IN ('Anyone can join waitlist with valid fields', 'No public read on waitlist')
  ) <> 2 THEN
    RAISE EXCEPTION 'public.waitlist is missing one of its two policies.';
  END IF;
END $$;
