-- ==============================================================================
-- Migration: 20261031000001_phase3_drop_unused_tables.sql
-- Description: Phase 3 schema cleanup — drop unused tables and orphaned RPCs
-- Reference: docs/DEAD_CODE_AUDIT.md (Batch 3-C)
-- ==============================================================================

-- 1. Drop unused weekly leaderboard snapshots
-- Never populated or queried in application runtime; leaderboard aggregates XP dynamically.
DROP TABLE IF EXISTS public.weekly_leaderboard_snapshots CASCADE;

-- 2. Drop unused bookmarks table
-- Pre-launch legacy feature superseded by lesson progress and review hubs.
DROP TABLE IF EXISTS public.bookmarks CASCADE;

-- 3. Drop unused email dead letter table
-- Failed email queue records are retained in email_queue with status='failed' and logged to system_errors.
DROP TABLE IF EXISTS public.email_dead_letter CASCADE;

-- 4. Drop unused user notification timeline
-- Historical timeline table; in-app notification inbox is served directly by in_app_notifications.
DROP TABLE IF EXISTS public.user_notification_timeline CASCADE;

-- 5. Drop orphaned RPC function
-- Standalone procedure with 0 callers; trigger trigger_sync_user_xp_on_update handles XP summation.
DROP FUNCTION IF EXISTS public.sync_user_xp(uuid) CASCADE;

