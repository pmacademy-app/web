-- Migration: 20260925000003_phase_t3_performance_query.sql
-- Description: Phase T3 Performance and Query Architecture optimization indexes.
-- Focus: Deterministic admin audit-log keyset pagination, selective user streak reminder scans,
-- and flashcard SRS composite lookups.

-- 1. Admin Audit Logs: Composite index for deterministic keyset pagination and ordering
-- Supports ORDER BY created_at DESC, id DESC and cursor filters (created_at, id)
CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_created_id
  ON public.admin_audit_logs (created_at DESC, id DESC);

-- 2. Admin Audit Logs: Filter index for administrator email lookups with timestamp ordering
CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_admin_created
  ON public.admin_audit_logs (admin_email, created_at DESC);

-- 3. User Flashcard SRS: Composite index for flashcard lookups and batch reviews
-- Complements PK (user_id, lesson_id, flashcard_id) where lesson_id is omitted in card queries
CREATE INDEX IF NOT EXISTS idx_user_flashcard_srs_user_card
  ON public.user_flashcard_srs (user_id, flashcard_id);

-- 4. Users: Partial index for daily reminder cron keyset scanner
-- Indexes active-streak users with valid email addresses for high-performance keyset paging
CREATE INDEX IF NOT EXISTS idx_users_streak_active
  ON public.users (id)
  WHERE current_streak > 0 AND email IS NOT NULL;
