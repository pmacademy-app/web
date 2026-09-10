-- Migration: 20260910000001_security_hardening_b1.sql
-- Prodily Production Hardening: Batch B1
-- 1. Restrict SECURITY DEFINER function execution privileges (S2-C1 / F-SEC-1)
-- 2. Pin safe search_path for SECURITY DEFINER functions (S2-C1)
-- 3. Remove direct public/anon access to full users table columns (S2-C2 / F-SEC-2)
-- 4. Create safe public_profiles projection view for public portfolio exposure
-- 5. Scope certificates table read access to prevent anonymous roster harvesting (S2-C4 / F-SEC-3)

SET search_path TO public, extensions, auth;

-- ============================================================================
-- 1. SECURITY DEFINER FUNCTION HARDENING (S2-C1 / F-SEC-1)
-- ============================================================================

-- Pin safe search_path on all SECURITY DEFINER functions
ALTER FUNCTION public.claim_email_queue_items(int) SET search_path = public, pg_temp;
ALTER FUNCTION public.get_admin_dashboard_summary() SET search_path = public, pg_temp;
ALTER FUNCTION public.increment_daily_email_quota(int) SET search_path = public, pg_temp;
ALTER FUNCTION public.get_current_daily_email_count() SET search_path = public, pg_temp;
ALTER FUNCTION public.increment_portfolio_view_count(uuid) SET search_path = public, pg_temp;
ALTER FUNCTION public.update_user_xp_and_level() SET search_path = public, pg_temp;
ALTER FUNCTION public.sync_user_xp_and_level_on_update() SET search_path = public, pg_temp;

-- Revoke default public execution privileges from PUBLIC, anon, and authenticated roles
REVOKE ALL ON FUNCTION public.claim_email_queue_items(int) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_admin_dashboard_summary() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.increment_daily_email_quota(int) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_current_daily_email_count() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.increment_portfolio_view_count(uuid) FROM PUBLIC, anon, authenticated;

-- Grant EXECUTE strictly to service_role and postgres roles
GRANT EXECUTE ON FUNCTION public.claim_email_queue_items(int) TO service_role, postgres;
GRANT EXECUTE ON FUNCTION public.get_admin_dashboard_summary() TO service_role, postgres;
GRANT EXECUTE ON FUNCTION public.increment_daily_email_quota(int) TO service_role, postgres;
GRANT EXECUTE ON FUNCTION public.get_current_daily_email_count() TO service_role, postgres;
GRANT EXECUTE ON FUNCTION public.increment_portfolio_view_count(uuid) TO service_role, postgres;

-- Add descriptive comments
COMMENT ON FUNCTION public.claim_email_queue_items(int) IS
  'Claims pending/retrying email queue items using FOR UPDATE SKIP LOCKED. Restricted to service_role.';
COMMENT ON FUNCTION public.get_admin_dashboard_summary() IS
  'Aggregates platform KPI metrics for the admin dashboard. Restricted to service_role.';
COMMENT ON FUNCTION public.increment_portfolio_view_count(uuid) IS
  'Atomically increments portfolio view count for public portfolios. Restricted to service_role.';

-- ============================================================================
-- 2. PUBLIC USERS DATA EXPOSURE HARDENING (S2-C2 / F-SEC-2)
-- ============================================================================

-- Drop the overly broad anon read policy on users that exposed email, is_admin, and other private columns
DROP POLICY IF EXISTS "Public can view public profiles" ON public.users;

-- Create a dedicated column-scoped public profile projection view containing ONLY safe public fields
CREATE OR REPLACE VIEW public.public_profiles AS
  SELECT
    id,
    username,
    name,
    bio,
    avatar_url,
    linkedin_url,
    github_url,
    website_url,
    total_xp,
    level,
    is_fellow,
    is_portfolio_public,
    portfolio_layout,
    featured_capstone_id,
    portfolio_view_count,
    current_streak,
    longest_streak,
    last_streak_date
  FROM public.users
  WHERE is_portfolio_public = true;

-- Grant SELECT on public_profiles view to anon, authenticated, and service_role
GRANT SELECT ON public.public_profiles TO anon, authenticated, service_role;

COMMENT ON VIEW public.public_profiles IS
  'Public learner profile projection containing strictly safe, non-sensitive portfolio columns.';

-- ============================================================================
-- 3. CERTIFICATES ROSTER EXPOSURE HARDENING (S2-C4 / F-SEC-3)
-- ============================================================================

-- Drop the blanket anon read policy on certificates that exposed the entire certificate roster
DROP POLICY IF EXISTS "Public can view certificates" ON public.certificates;

-- Allow authenticated users to view only their own certificates
DROP POLICY IF EXISTS "Users can view own certificates" ON public.certificates;
CREATE POLICY "Users can view own certificates" ON public.certificates
  FOR SELECT
  USING (auth.uid() = user_id);

-- Preserve/ensure insert policy for learners issuing their own certificates
DROP POLICY IF EXISTS "Users can insert own certificates" ON public.certificates;
CREATE POLICY "Users can insert own certificates" ON public.certificates
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);
