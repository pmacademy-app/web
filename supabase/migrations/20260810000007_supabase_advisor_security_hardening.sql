-- Migration: 20260810000007_supabase_advisor_security_hardening.sql
-- Description: Harden database security per Supabase Advisor findings. Enables RLS on internal tables, hardens function search_paths, and tightens waitlist insert policy.

SET search_path TO public, extensions, auth;

-- 1. Enable RLS on internal tables (deny-by-default stance for anon and authenticated client roles)
ALTER TABLE IF EXISTS public.email_dead_letter ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.email_delivery_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.notification_feature_flags ENABLE ROW LEVEL SECURITY;

-- 2. Harden PL/pgSQL function search_paths to prevent search_path escalation vulnerabilities
ALTER FUNCTION public.calculate_user_level(int) SET search_path = public, pg_temp;
ALTER FUNCTION public.update_user_xp_and_level() SET search_path = public, pg_temp;
ALTER FUNCTION public.sync_user_xp_and_level_on_update() SET search_path = public, pg_temp;

-- 3. Tighten Waitlist Insert RLS policy with explicit column bounds and email format check
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
