-- Migration: Add is_fellow column to users table
-- Enables admin-controlled "Product Management Fellow at Prodily" designation on public portfolios

ALTER TABLE public.users
ADD COLUMN IF NOT EXISTS is_fellow boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.users.is_fellow IS
'When true, designates the user as a Product Management Fellow at Prodily on their public portfolio. Admin-controlled only.';
