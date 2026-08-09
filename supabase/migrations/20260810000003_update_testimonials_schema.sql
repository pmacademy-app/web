-- Migration: 20260810000003_update_testimonials_schema.sql
-- Description: Add rating, headline, author_role, is_featured columns to testimonials table for public review moderation

ALTER TABLE IF EXISTS public.testimonials
  ADD COLUMN IF NOT EXISTS rating integer CHECK (rating BETWEEN 1 AND 5) DEFAULT 5 NOT NULL,
  ADD COLUMN IF NOT EXISTS headline text,
  ADD COLUMN IF NOT EXISTS author_role text DEFAULT 'PM Academy Learner',
  ADD COLUMN IF NOT EXISTS is_featured boolean DEFAULT false NOT NULL;
