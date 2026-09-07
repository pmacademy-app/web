-- Migration: Add portfolio_verification_override column to users table
--
-- Portfolio Verification is AUTOMATIC by default: eligibility is computed live
-- from existing profile fields (avatar, bio, social links) — no stored
-- "is_verified" boolean is needed for that path, avoiding an extra write on
-- every profile save. This column exists ONLY to let an admin override the
-- automatic result (force-verify or force-reject); NULL means "no override,
-- automatic eligibility applies" (the default source of truth).

ALTER TABLE public.users
ADD COLUMN IF NOT EXISTS portfolio_verification_override text
  CHECK (portfolio_verification_override IN ('verified', 'rejected'));

COMMENT ON COLUMN public.users.portfolio_verification_override IS
'Admin override for automatic portfolio verification. NULL = automatic eligibility applies (default). ''verified''/''rejected'' = admin-forced, takes precedence over automatic computation.';
