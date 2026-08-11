-- Migration: Add curriculum_access_override column to users table
-- Enables per-user override for curriculum access without altering learning progress/XP

ALTER TABLE public.users
ADD COLUMN IF NOT EXISTS curriculum_access_override boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.users.curriculum_access_override IS
'When true, grants full access to browse all lessons across all modules regardless of sequential unlock requirements, without modifying actual completion progress or XP.';
