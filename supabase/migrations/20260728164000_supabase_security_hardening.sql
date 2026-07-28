-- PM Academy — Supabase Database Security Hardening
-- Migration: 20260728164000_supabase_security_hardening.sql

SET search_path TO public, extensions, auth;

-- Revoke default execute permissions from public, anon, and authenticated roles
-- for trigger functions to prevent direct execution via REST/RPC APIs.
-- By default, public schema functions are executable by PUBLIC.
REVOKE EXECUTE ON FUNCTION update_user_xp_and_level() FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION sync_user_xp_and_level_on_update() FROM public, anon, authenticated;

-- Keep execute permission for service_role and postgres roles (which run triggers)
GRANT EXECUTE ON FUNCTION update_user_xp_and_level() TO service_role, postgres;
GRANT EXECUTE ON FUNCTION sync_user_xp_and_level_on_update() TO service_role, postgres;

-- Document waitlist policy rationale
COMMENT ON TABLE waitlist IS 'Waitlist pre-signup database. Permissive RLS insert is required for anonymous registration; input validation is handled by API route.';
