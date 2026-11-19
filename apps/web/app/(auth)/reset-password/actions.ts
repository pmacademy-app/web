'use server'

import { cookies, headers } from 'next/headers'
import { createClient } from '@supabase/supabase-js'
import { createServiceRoleClient } from '@/lib/supabase'
import { classifyAuthError } from '@/lib/auth/errors'
import { MIN_PASSWORD_LENGTH, PASSWORD_MIN_LENGTH_MESSAGE } from '@/lib/auth/password-policy'
import { RECOVERY_MARKER_COOKIE, recoveryMarkerCookieOptions, verifyRecoveryMarker } from '@/lib/auth/recovery-marker'
import { evaluatePersistentRateLimit } from '@/lib/rate-limit'
import { getClientIpBucket } from '@/lib/security/client-ip'

/**
 * Persistent, fail-closed limits. The bucket names and values are the ones the old
 * `/api/auth/update-password` route used (10 per IP and 5 per user per 15 minutes).
 */
const IP_LIMIT = { windowMs: 15 * 60 * 1000, limit: 10, failClosed: true }
const USER_LIMIT = { windowMs: 15 * 60 * 1000, limit: 5, failClosed: true }

/** Bounds the work a single call can ask of the provider. GoTrue caps bcrypt input at 72 bytes. */
const MAX_PASSWORD_LENGTH = 256

const EXPIRED_MESSAGE = 'Your password reset link has expired. Please request a new one.'
const NO_SESSION_MESSAGE = 'No active recovery session found. Please request a new password reset link.'
const RATE_LIMITED_MESSAGE = 'Too many password update attempts. Please wait a while before trying again.'

type UpdatePasswordResult =
  | { success: true; error?: undefined; code?: undefined }
  | { success?: undefined; error: string; code: string }

/**
 * Sets a new password from the reset page (H1).
 *
 * Only a recovery session may use this. Every session cookie proves "signed in", not
 * "came through a recovery link", so the action also requires the signed recovery
 * marker the callback sets on a recovery link (`lib/auth/recovery-marker.ts`), and the
 * marker must name the same user the session resolves to. On success the marker and
 * the session cookies are cleared and every session of the account is revoked, so a
 * session an attacker may hold does not outlive the reset.
 *
 * Return shape is unchanged for the page: `{ success: true }` or `{ error, code }`.
 */
export async function updatePasswordAction(newPassword: string): Promise<UpdatePasswordResult> {
  try {
    if (typeof newPassword !== 'string' || newPassword.length < MIN_PASSWORD_LENGTH) {
      return { error: PASSWORD_MIN_LENGTH_MESSAGE, code: 'AUTH_PASSWORD_TOO_WEAK' }
    }
    if (newPassword.length > MAX_PASSWORD_LENGTH) {
      return { error: `Password must be ${MAX_PASSWORD_LENGTH} characters or fewer.`, code: 'AUTH_PASSWORD_TOO_WEAK' }
    }

    const cookieStore = await cookies()
    const accessToken = cookieStore.get('sb-access-token')?.value
    const refreshToken = cookieStore.get('sb-refresh-token')?.value
    const markerUserId = verifyRecoveryMarker(cookieStore.get(RECOVERY_MARKER_COOKIE)?.value)

    const clearRecoveryState = () => {
      cookieStore.delete('sb-access-token')
      cookieStore.delete('sb-refresh-token')
      cookieStore.delete({ name: RECOVERY_MARKER_COOKIE, path: recoveryMarkerCookieOptions().path })
    }

    if (!accessToken && !refreshToken) {
      return { error: NO_SESSION_MESSAGE, code: 'AUTH_SESSION_SYNC_FAILED' }
    }

    // Without a valid marker this is a normal session, not a recovery one. Nothing is
    // cleared: the learner may be signed in legitimately and simply opened this form.
    if (!markerUserId) {
      return { error: EXPIRED_MESSAGE, code: 'AUTH_SESSION_SYNC_FAILED' }
    }

    const ipBucket = getClientIpBucket({ headers: await headers() })
    const ipLimit = await evaluatePersistentRateLimit(`update_pwd_ip:${ipBucket}`, IP_LIMIT)
    if (!ipLimit.success) {
      return { error: RATE_LIMITED_MESSAGE, code: 'AUTH_RATE_LIMITED' }
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

    let userId: string | null = null
    // The access token used for the global sign-out after the change.
    let sessionAccessToken: string | null = null

    // Step 1: validate the httpOnly access token with the provider.
    if (accessToken) {
      try {
        const verifyClient = createClient(supabaseUrl, anonKey, {
          auth: { persistSession: false },
        })
        const { data: { user }, error } = await verifyClient.auth.getUser(accessToken)
        if (!error && user?.id) {
          userId = user.id
          sessionAccessToken = accessToken
        }
      } catch {
        // Access token verification failed; fall through to refresh below
      }
    }

    // Step 2: an expired access token falls back to the httpOnly refresh token. It is
    // read strictly from the cookie and cannot be supplied by the caller.
    if (!userId && refreshToken) {
      const refreshClient = createClient(supabaseUrl, anonKey, {
        auth: { persistSession: false },
      })
      const { data: refreshData, error: refreshError } = await refreshClient.auth.refreshSession({
        refresh_token: refreshToken,
      })

      if (refreshError || !refreshData?.session?.user) {
        clearRecoveryState()
        return { error: EXPIRED_MESSAGE, code: 'AUTH_SESSION_SYNC_FAILED' }
      }

      userId = refreshData.session.user.id
      sessionAccessToken = refreshData.session.access_token
    }

    if (!userId) {
      clearRecoveryState()
      return { error: EXPIRED_MESSAGE, code: 'AUTH_SESSION_SYNC_FAILED' }
    }

    // The marker was issued for one account. A session for any other account (the
    // learner signed in as someone else after clicking the link) is refused.
    if (userId !== markerUserId) {
      return { error: EXPIRED_MESSAGE, code: 'AUTH_SESSION_SYNC_FAILED' }
    }

    const userLimit = await evaluatePersistentRateLimit(`update_pwd_user:user:${userId}`, USER_LIMIT)
    if (!userLimit.success) {
      return { error: RATE_LIMITED_MESSAGE, code: 'AUTH_RATE_LIMITED' }
    }

    // Step 3: the Admin API sets the password for the validated user id. password_set
    // keeps Settings from treating a Google-only account that just set a password as
    // Google-only (same flag Settings > Security writes).
    const adminClient = createServiceRoleClient()
    const { error: updateError } = await adminClient.auth.admin.updateUserById(userId, {
      password: newPassword,
      app_metadata: { password_set: true },
    })

    if (updateError) {
      console.error('[updatePasswordAction] Admin update error:', updateError.message)
      // Classifier copy, never the provider's message: the action's return value is
      // serialized to the browser.
      const classified = classifyAuthError(updateError, 'reset_password')
      return { error: classified.message, code: classified.code }
    }

    // Step 4 (L5): end every session of the account, the recovery session included.
    // Best effort: the password is already changed, and the learner signs in again.
    if (sessionAccessToken) {
      try {
        const { error: signOutError } = await adminClient.auth.admin.signOut(sessionAccessToken, 'global')
        if (signOutError) console.error('[updatePasswordAction] Global sign-out failed:', signOutError.message)
      } catch (err) {
        console.error('[updatePasswordAction] Global sign-out failed:', err)
      }
    }

    clearRecoveryState()
    return { success: true }
  } catch (err) {
    console.error('[updatePasswordAction] Unexpected error:', err)
    return { error: 'An unexpected error occurred.', code: 'AUTH_UNKNOWN_ERROR' }
  }
}
