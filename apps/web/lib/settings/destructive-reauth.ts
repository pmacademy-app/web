import { NextResponse } from 'next/server'
import type { User } from '@supabase/supabase-js'
import { createServiceRoleClient } from '@/lib/supabase'
import { requireUserId, type Actor } from '@/lib/api/actor'
import { hasPasswordIdentity, type ServiceClient } from '@/lib/auth/oauth-account-guard'
import { evaluatePersistentRateLimit } from '@/lib/rate-limit'

export const RECENT_LOGIN_WINDOW_MS = 10 * 60 * 1000 // 10 minutes (600,000 ms)

export const DESTRUCTIVE_RATE_LIMIT = {
  limit: 5,
  windowMs: 15 * 60 * 1000, // 15 minutes
  failClosed: true,
}

export type DestructiveExpectedPhrase = 'DELETE' | 'RESET'

export interface DestructiveReauthParams {
  actor: Actor
  body: unknown
  expectedPhrase: DestructiveExpectedPhrase
  adminClient?: ServiceClient
}

export type DestructiveReauthResult =
  | { ok: true; userId: string; user: User }
  | { ok: false; response: NextResponse }

/**
 * Re-authentication and rate limiting helper for destructive account actions.
 *
 * SEC-12: Destructive operations (account deletion and curriculum/stat resets)
 * require re-authentication to prevent CSRF or stolen session abuse:
 * - Rate-limited to 5 attempts per 15 minutes per user, fail-closed.
 * - Password accounts: verify currentPassword via signInWithPassword.
 * - Google-only accounts: require exact confirmation phrase ('DELETE' or 'RESET')
 *   and verify last_sign_in_at occurred within the last 10 minutes.
 */
export async function verifyDestructiveReauth({
  actor,
  body,
  expectedPhrase,
  adminClient,
}: DestructiveReauthParams): Promise<DestructiveReauthResult> {
  const userId = requireUserId(actor)

  // 1. Fail-closed rate limiting per user across all destructive actions
  const rateLimitResult = await evaluatePersistentRateLimit(`settings_destructive_${userId}`, {
    limit: DESTRUCTIVE_RATE_LIMIT.limit,
    windowMs: DESTRUCTIVE_RATE_LIMIT.windowMs,
    failClosed: DESTRUCTIVE_RATE_LIMIT.failClosed,
  })

  if (!rateLimitResult.success) {
    const retryAfter = Math.ceil(rateLimitResult.resetInMs / 1000)
    return {
      ok: false,
      response: NextResponse.json(
        {
          success: false,
          code: 'RATE_LIMITED',
          error: 'Too many attempts. Please try again later.',
        },
        {
          status: 429,
          headers: {
            'Retry-After': String(retryAfter),
          },
        }
      ),
    }
  }

  // 2. Fetch auth user to inspect authentication mode and session timestamps
  const supabase = adminClient ?? createServiceRoleClient()
  const { data: userData, error: userError } = await supabase.auth.admin.getUserById(userId)

  if (userError || !userData?.user) {
    return {
      ok: false,
      response: NextResponse.json(
        { success: false, error: 'Authentication required.' },
        { status: 401 }
      ),
    }
  }

  const user = userData.user
  const hasPassword = hasPasswordIdentity(user)
  const payload = (typeof body === 'object' && body !== null ? body : {}) as {
    currentPassword?: unknown
    confirmationPhrase?: unknown
  }

  // 3. Password accounts: verify currentPassword against Supabase Auth
  if (hasPassword) {
    const currentPassword = typeof payload.currentPassword === 'string' ? payload.currentPassword : ''

    if (!currentPassword.trim()) {
      return {
        ok: false,
        response: NextResponse.json(
          { success: false, error: 'Current password is required.' },
          { status: 400 }
        ),
      }
    }

    const userEmail = user.email || (actor.kind === 'learner' ? actor.email : null)
    if (!userEmail) {
      return {
        ok: false,
        response: NextResponse.json(
          { success: false, error: 'Authentication required.' },
          { status: 401 }
        ),
      }
    }

    const { error: verifyError } = await supabase.auth.signInWithPassword({
      email: userEmail,
      password: currentPassword,
    })

    if (verifyError) {
      return {
        ok: false,
        response: NextResponse.json(
          { success: false, error: 'Current password is incorrect.' },
          { status: 400 }
        ),
      }
    }

    return { ok: true, userId, user }
  }

  // 4. Google-only accounts: require confirmation phrase and recent sign-in
  const confirmationPhrase = typeof payload.confirmationPhrase === 'string' ? payload.confirmationPhrase.trim() : ''

  if (confirmationPhrase !== expectedPhrase) {
    return {
      ok: false,
      response: NextResponse.json(
        { success: false, error: `Confirmation phrase must be "${expectedPhrase}".` },
        { status: 400 }
      ),
    }
  }

  const lastSignInTime = user.last_sign_in_at ? new Date(user.last_sign_in_at).getTime() : 0
  const now = Date.now()
  const isRecent = user.last_sign_in_at && !isNaN(lastSignInTime) && now - lastSignInTime <= RECENT_LOGIN_WINDOW_MS

  if (!isRecent) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          success: false,
          code: 'RECENT_LOGIN_REQUIRED',
          error: 'Recent sign-in required. Please log out and sign in again before performing this action.',
        },
        { status: 403 }
      ),
    }
  }

  return { ok: true, userId, user }
}
