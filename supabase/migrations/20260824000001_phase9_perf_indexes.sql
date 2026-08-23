-- Migration: 20260824000001_phase9_perf_indexes.sql
-- Description: Phase 9 performance optimization indexes for composite XP idempotency lookups, badge resolution, and public portfolio searches.

-- 1. XP events idempotency index for hasXpEvent queries
CREATE INDEX IF NOT EXISTS idx_xp_events_user_source
  ON public.xp_events (user_id, source_type, source_id);

-- 2. User badges composite lookup index for completion badge resolutions
CREATE INDEX IF NOT EXISTS idx_user_badges_badge_user
  ON public.user_badges (badge_id, user_id);

-- 3. Filtered index for public portfolio discovery and profile lookups
CREATE INDEX IF NOT EXISTS idx_users_portfolio_public
  ON public.users (is_portfolio_public, username)
  WHERE is_portfolio_public = true;
