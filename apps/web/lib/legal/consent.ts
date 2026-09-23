/**
 * Signup-time legal consent: which document versions a learner agreed to, and the
 * self-service age floor.
 *
 * The September 2026 audit found that Terms §1 claimed agreement happened "by
 * creating an account" while nothing in the signup UI presented or recorded that
 * agreement, and that the stated 13+ minimum age was both unenforced and
 * misaligned with India's DPDP Act (which treats everyone under 18 as a child).
 *
 * This module is the one place those two facts are defined, so the signup form,
 * the signup API and the public legal pages cannot drift apart.
 */

/**
 * Bump when the substance of `/terms` or `/privacy` changes in a way that a
 * learner should re-consent to. Stored verbatim on `users.terms_version` /
 * `users.privacy_version`, so a change here only affects accounts created after it.
 *
 * Format: ISO date of the revision.
 */
export const TERMS_VERSION = '2026-09-23'
export const PRIVACY_VERSION = '2026-09-23'

/** Human-readable revision label rendered at the top of both legal documents. */
export const LEGAL_DOCS_REVISION_LABEL = 'September 2026'

/**
 * Minimum age for self-service signup.
 *
 * Raised from 13 to 18 on the audit's recommendation: DPDP Act 2023 §9 requires
 * verifiable parental consent for every user under 18, and Prodily deliberately
 * does not implement a parental-consent flow. Serving under-18 learners would be a
 * separately-scoped project (verifiable parental consent, no behavioural tracking
 * of that cohort, its own legal review) — not a quiet loosening of this constant.
 */
export const MINIMUM_SIGNUP_AGE = 18

/** What a learner must affirm before an account can be created. */
export interface SignupConsent {
  /** Agreed to the Terms of Service and Privacy Policy. */
  acceptedTerms: boolean
  /** Self-certified as at least `MINIMUM_SIGNUP_AGE`. */
  confirmedMinimumAge: boolean
}

/** The consent record persisted against a new user profile. */
export interface ConsentRecord {
  terms_accepted_at: string
  terms_version: string
  privacy_version: string
  age_confirmed_at: string
  age_confirmed_minimum: number
}

/**
 * Builds the row fragment written to `public.users` at profile creation.
 *
 * The document versions come from this module, never from the request body: a
 * client-supplied version would let a caller claim consent to a document that was
 * never shown. The timestamp is server-side for the same reason.
 */
export function buildConsentRecord(acceptedAt: Date = new Date()): ConsentRecord {
  const iso = acceptedAt.toISOString()
  return {
    terms_accepted_at: iso,
    terms_version: TERMS_VERSION,
    privacy_version: PRIVACY_VERSION,
    age_confirmed_at: iso,
    age_confirmed_minimum: MINIMUM_SIGNUP_AGE,
  }
}

/**
 * Recovers a consent record from Supabase Auth user metadata.
 *
 * Flow A (email verification ON) creates the `public.users` row at verification
 * time, not at signup, so the consent captured on the form rides along in auth
 * metadata exactly as the pending referral code does, and is persisted when the
 * profile is finally created.
 *
 * Returns `null` for accounts that predate consent capture — existing users are
 * never retroactively marked as having consented, and never blocked for it.
 */
export function consentFromAuthMetadata(metadata: unknown): ConsentRecord | null {
  if (!metadata || typeof metadata !== 'object') return null
  const meta = metadata as Record<string, unknown>

  const acceptedAt = meta.terms_accepted_at
  const termsVersion = meta.terms_version
  if (typeof acceptedAt !== 'string' || typeof termsVersion !== 'string') return null

  return {
    terms_accepted_at: acceptedAt,
    terms_version: termsVersion,
    privacy_version: typeof meta.privacy_version === 'string' ? meta.privacy_version : PRIVACY_VERSION,
    age_confirmed_at: typeof meta.age_confirmed_at === 'string' ? meta.age_confirmed_at : acceptedAt,
    age_confirmed_minimum:
      typeof meta.age_confirmed_minimum === 'number' ? meta.age_confirmed_minimum : MINIMUM_SIGNUP_AGE,
  }
}
