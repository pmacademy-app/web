-- Migration: 20260810000006_add_author_name_to_testimonials.sql
-- Description: Add author_name column to public.testimonials table for public review attribution

ALTER TABLE IF EXISTS public.testimonials
  ADD COLUMN IF NOT EXISTS author_name text;
