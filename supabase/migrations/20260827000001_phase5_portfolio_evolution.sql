-- PM Academy — Phase 5 Portfolio Evolution Migration
-- Migration: 20260827000001_phase5_portfolio_evolution.sql
-- Adds portfolio customization columns: portfolio_layout, featured_capstone_id, portfolio_view_count

SET search_path TO public, extensions, auth;

-- 1. Add portfolio layout, featured capstone, and view count columns
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS portfolio_layout jsonb DEFAULT '["hero","radar","capstones","achievements"]'::jsonb,
  ADD COLUMN IF NOT EXISTS featured_capstone_id uuid REFERENCES capstone_submissions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS portfolio_view_count integer NOT NULL DEFAULT 0;

-- 2. Index on featured_capstone_id for efficient joins
CREATE INDEX IF NOT EXISTS users_featured_capstone_idx ON users (featured_capstone_id);

-- 3. Stored procedure for atomic view count increment
CREATE OR REPLACE FUNCTION increment_portfolio_view_count(target_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE users
  SET portfolio_view_count = COALESCE(portfolio_view_count, 0) + 1
  WHERE id = target_user_id AND is_portfolio_public = true;
END;
$$;
