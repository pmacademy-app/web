import type { User } from '@supabase/supabase-js'
import type { createServiceRoleClient } from '@/lib/supabase'
import { log } from '@/lib/monitoring/log'

/**
 * Decides whether an auth user created by Google sign-in may be deleted outright.
 *
 * Two flows delete an account that was just made: the user declines consent on the
 * gate page, and the callback finds signups closed or the aggregate signup limit hit.
 * Deleting cascades through the profile, so the bar is high and every check must pass:
 * every identity is Google, no password, created within the window, a Google profile
 * (or, where the caller allows, no profile yet), and no learning activity.
 * Anything that fails, errors or looks unfamiliar answers "not fresh" and the caller
 * signs the user out instead. A wrongly kept account costs nothing; a wrongly deleted
 * one loses a learner's progress.
 */

export type ServiceClient = ReturnType<typeof createServiceRoleClient>

export const FRESH_ACCOUNT_WINDOW_MS = 30 * 60 * 1000

/** Tables that prove a learner has used the account. All are keyed by `user_id`. */
export const ACTIVITY_TABLES = [
  'user_lesson_progress',
  'quiz_attempts',
  'xp_events',
  'capstone_submissions',
  'user_flashcard_srs',
] as const

/** Allowed clock drift when comparing the auth user's created_at with now. */
const CLOCK_SKEW_MS = 60_000

/**
 * True when the account can sign in with a password: an `email` identity, or `email`
 * among the providers. Either signal is enough, so a merged account is never treated
 * as Google-only.
 */
export function hasPasswordIdentity(user: Pick<User, 'identities' | 'app_metadata'>): boolean {
  // An explicit flag wins: password routes set it to true, and the Google link
  // takeover defence sets it to false after rotating the password to a random value.
  const passwordSet = user.app_metadata?.password_set
  if (passwordSet === true) return true
  if (passwordSet === false) return false
  if (user.identities?.some((identity) => identity?.provider === 'email')) return true
  const providers = user.app_metadata?.providers
  return Array.isArray(providers) && providers.includes('email')
}

/**
 * The same check for a user id. TRUE on any lookup failure: callers use a false answer
 * to refuse password operations, and an outage should fall back to the old password
 * check rather than lock a password user out.
 */
export async function fetchHasPasswordIdentity(admin: ServiceClient, userId: string): Promise<boolean> {
  try {
    const { data, error } = await admin.auth.admin.getUserById(userId)
    if (error || !data?.user) return true
    return hasPasswordIdentity(data.user)
  } catch {
    return true
  }
}

export interface FreshGuardOptions {
  now?: number
  /** A missing `public.users` row is acceptable (the callback refuses before creating it). */
  profileMayBeMissing?: boolean
  /**
   * The row must still be missing. The callback re-reads it right before deleting, so
   * a parallel sign-in that already created the profile is never deleted underneath it.
   */
  profileMustBeMissing?: boolean
  /** The profile's consent must still be NULL (consent-gate decline). */
  requireNullConsent?: boolean
}

/** True when the user has at least one identity and every one of them is Google. */
function isGoogleOnly(user: Pick<User, 'identities'>): boolean {
  const identities = user.identities ?? []
  return identities.length > 0 && identities.every((identity) => identity?.provider === 'google')
}

export async function isFreshGoogleOnlyUser(
  admin: ServiceClient,
  user: User,
  opts?: FreshGuardOptions
): Promise<boolean> {
  const now = opts?.now ?? Date.now()
  try {
    if (hasPasswordIdentity(user)) return false
    if (!isGoogleOnly(user)) return false

    const createdAt = Date.parse(user.created_at)
    if (!Number.isFinite(createdAt)) return false
    const age = now - createdAt
    if (age > FRESH_ACCOUNT_WINDOW_MS || age < -CLOCK_SKEW_MS) return false

    const { data: profile, error: profileError } = await admin
      .from('users')
      .select('auth_provider, terms_accepted_at')
      .eq('id', user.id)
      .maybeSingle()
    if (profileError) return false
    if (profile) {
      if (opts?.profileMustBeMissing) return false
      if (profile.auth_provider !== 'google') return false
      if (opts?.requireNullConsent && profile.terms_accepted_at) return false
    } else if (!opts?.profileMayBeMissing && !opts?.profileMustBeMissing) {
      return false
    }

    const counts = await Promise.all(
      ACTIVITY_TABLES.map((table) =>
        admin.from(table).select('user_id', { count: 'exact', head: true }).eq('user_id', user.id)
      )
    )
    return counts.every(({ count, error }) => !error && count === 0)
  } catch {
    return false
  }
}

/** Deletes the auth user only when isFreshGoogleOnlyUser passes. Never throws. */
export async function deleteFreshGoogleUserIfSafe(
  admin: ServiceClient,
  user: User,
  opts?: FreshGuardOptions
): Promise<{ deleted: boolean }> {
  try {
    if (!(await isFreshGoogleOnlyUser(admin, user, opts))) {
      log.info('auth.oauth.delete_skipped', { userId: user.id })
      return { deleted: false }
    }
    const { error } = await admin.auth.admin.deleteUser(user.id)
    if (error) {
      log.warnException('auth.oauth.delete_failed', error, { userId: user.id })
      return { deleted: false }
    }
    log.info('auth.oauth.deleted_fresh_user', { userId: user.id })
    return { deleted: true }
  } catch (cause) {
    log.warnException('auth.oauth.delete_failed', cause, { userId: user.id })
    return { deleted: false }
  }
}
