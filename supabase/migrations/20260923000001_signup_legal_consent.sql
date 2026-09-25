-- Migration: Record Terms/Privacy acceptance and 18+ self-certification at signup
--
-- The September 2026 legal/privacy audit found that Terms §1 claimed agreement
-- happened "by creating an account" while no checkbox, no link and no consent
-- record existed anywhere in the signup path, and that the stated 13+ minimum age
-- was unenforced and misaligned with DPDP Act 2023 §9 (child = under 18).
--
-- These columns are the consent record. They are deliberately NULLABLE with no
-- backfill and no default: accounts created before this migration genuinely did
-- not consent through a presented agreement, and inventing a timestamp for them
-- would be a fabricated record. Existing users are not blocked and not migrated —
-- a NULL here means "predates consent capture", not "refused".

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS terms_accepted_at timestamptz,
  ADD COLUMN IF NOT EXISTS terms_version text,
  ADD COLUMN IF NOT EXISTS privacy_version text,
  ADD COLUMN IF NOT EXISTS age_confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS age_confirmed_minimum smallint;

COMMENT ON COLUMN public.users.terms_accepted_at IS
'UTC timestamp at which the learner ticked the Terms of Service + Privacy Policy checkbox during signup. NULL = account predates consent capture (2026-09-23); such accounts are NOT retroactively blocked.';

COMMENT ON COLUMN public.users.terms_version IS
'Version identifier (ISO revision date) of the Terms of Service presented at signup. Sourced server-side from lib/legal/consent.ts — never from the request body.';

COMMENT ON COLUMN public.users.privacy_version IS
'Version identifier (ISO revision date) of the Privacy Policy presented at signup.';

COMMENT ON COLUMN public.users.age_confirmed_at IS
'UTC timestamp at which the learner self-certified meeting the minimum signup age. NULL = account predates the age gate.';

COMMENT ON COLUMN public.users.age_confirmed_minimum IS
'The minimum age the learner certified to at signup (18 as of 2026-09-23). Stored rather than assumed so a future change to the floor does not rewrite history.';

-- Lets compliance answer "which accounts have no recorded consent?" without a
-- sequential scan once the table grows. Partial: the NULL set is the interesting
-- one and it stops growing after this migration ships.
CREATE INDEX IF NOT EXISTS idx_users_terms_accepted_at_null
  ON public.users (id)
  WHERE terms_accepted_at IS NULL;
