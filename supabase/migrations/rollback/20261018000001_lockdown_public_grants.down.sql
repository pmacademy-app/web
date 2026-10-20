-- Rollback for Phase 1 / PR-01, lock down database permissions.
--
-- This file only reverses the part of 20261018000001 that could plausibly cause an outage:
-- the default privileges for functions postgres creates. After the forward migration, a new
-- function is not executable by anon or authenticated (or PUBLIC) until a migration grants it,
-- so a later migration that forgot its GRANT can break a learner-facing RPC or a helper used
-- inside an RLS policy. Running this file restores the old Supabase behaviour for new
-- functions. It does not touch any existing function, table, view or policy.
--
-- It deliberately does NOT restore anything the forward migration closed on purpose:
--   - EXECUTE on sync_user_xp and record_lesson_quiz_completion for authenticated (SEC-01);
--   - the "Service role has full access to ..." FOR ALL policies on email_broadcasts and
--     fellow_requests, and the anon/authenticated table privileges on them (SEC-03, SEC-06);
--   - the testimonials "Users can submit feedback" INSERT policy (SEC-05).
-- No app code depends on any of those (every caller uses the service-role client). If one
-- really must come back, see rollback/20261018000001_reopen_holes.down.sql and read its header.
--
-- public_profiles (SEC-02) is never re-created, here or in the reopen file. Nothing reads it,
-- and re-creating it under Supabase's default table privileges would make an RLS-bypassing view
-- over public.users readable (and writable) with the anon key.
--
-- The search_path pins on sync_user_xp, update_user_xp_and_level and
-- sync_user_xp_and_level_on_update are kept: they are safe on their own.
--
-- No data is touched. Re-runnable.

ALTER DEFAULT PRIVILEGES FOR ROLE postgres GRANT EXECUTE ON FUNCTIONS TO PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated;
