-- PM Academy — Phase 7 Referrals & Organic Growth Schema Migration
-- Migration: 20260828000002_phase7_referrals.sql
-- Creates public.referrals table, performance indexes, and RLS policies

SET search_path TO public, extensions, auth;

-- 1. Create referrals table
CREATE TABLE IF NOT EXISTS public.referrals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  referred_user_id uuid NOT NULL UNIQUE REFERENCES public.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'signed_up' CHECK (status IN ('signed_up', 'activated', 'rewarded')),
  rewarded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 2. Indexes for fast referral lookup, 1-to-1 uniqueness, and aggregation
CREATE INDEX IF NOT EXISTS referrals_referrer_idx
  ON public.referrals (referrer_id);

CREATE UNIQUE INDEX IF NOT EXISTS referrals_referred_user_idx
  ON public.referrals (referred_user_id);

CREATE INDEX IF NOT EXISTS referrals_created_at_idx
  ON public.referrals (created_at);

CREATE INDEX IF NOT EXISTS referrals_referrer_created_idx
  ON public.referrals (referrer_id, created_at DESC);

-- 3. Row Level Security
ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'referrals' AND policyname = 'Users can view own sent referrals'
  ) THEN
    CREATE POLICY "Users can view own sent referrals"
      ON public.referrals FOR SELECT
      TO authenticated
      USING (auth.uid() = referrer_id);
  END IF;
END $$;
