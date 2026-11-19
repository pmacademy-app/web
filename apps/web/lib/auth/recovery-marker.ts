import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import type { NextResponse } from 'next/server'
import { getOAuthStateSecret } from '@/lib/auth/oauth-intent'

/**
 * The password-recovery marker (H1).
 *
 * A recovery link (`/api/auth/callback?token_hash=...&type=recovery`) mints an ordinary
 * Supabase session, indistinguishable from a password login. Without a marker, anything
 * holding a session cookie could set a new password with no current password, which
 * turns a stolen or borrowed session into a permanent account takeover.
 *
 * The callback's recovery branch therefore also sets this short-lived, signed,
 * httpOnly, SameSite=Strict cookie bound to the recovered user id. The reset action
 * requires it, checks it names the same user as the session, and clears it on success.
 *
 * Format: `${base64url(json)}.${base64url(hmacSha256(key, base64url(json)))}`.
 *
 * Key: derived from `OAUTH_STATE_SECRET` (the existing server signing secret) with a
 * purpose label, so a marker can never verify as an OAuth intent or the reverse. When
 * that secret is absent it is derived from `SUPABASE_SERVICE_ROLE_KEY` instead, which
 * every environment that can reset a password already has. Server only.
 */

export const RECOVERY_MARKER_COOKIE = 'prodily_recovery'

/** Ten minutes: long enough to type a new password, short enough to be useless later. */
export const RECOVERY_MARKER_MAX_AGE_SECONDS = 600

const CLOCK_SKEW_MS = 30_000
const BASE64URL = /^[A-Za-z0-9_-]+$/
const KEY_LABEL = 'prodily.recovery-marker.v1'
const MIN_FALLBACK_SECRET_LENGTH = 32

interface RecoveryMarkerPayload {
  uid: string
  iat: number
  n: string
}

function markerKey(): Buffer | null {
  const base = getOAuthStateSecret() ?? fallbackSecret()
  if (!base) return null
  return createHmac('sha256', base).update(KEY_LABEL).digest()
}

function fallbackSecret(): string | null {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  return key && key.length >= MIN_FALLBACK_SECRET_LENGTH ? key : null
}

function sign(payload: string, key: Buffer): Buffer {
  return createHmac('sha256', key).update(payload).digest()
}

/** A signed marker for `userId`, or null when no signing secret is configured. */
export function signRecoveryMarker(userId: string, now: number = Date.now()): string | null {
  const key = markerKey()
  if (!key || !userId) return null
  const body: RecoveryMarkerPayload = { uid: userId, iat: now, n: randomBytes(12).toString('base64url') }
  const payload = Buffer.from(JSON.stringify(body), 'utf8').toString('base64url')
  return `${payload}.${sign(payload, key).toString('base64url')}`
}

/** The user id a valid, unexpired marker was issued for, or null. */
export function verifyRecoveryMarker(token: string | null | undefined, now: number = Date.now()): string | null {
  if (typeof token !== 'string' || token.length === 0 || token.length > 1024) return null
  const key = markerKey()
  if (!key) return null

  const parts = token.split('.')
  if (parts.length !== 2) return null
  const [payload, signature] = parts
  if (!payload || !signature || !BASE64URL.test(payload) || !BASE64URL.test(signature)) return null

  const expected = sign(payload, key)
  const provided = Buffer.from(signature, 'base64url')
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) return null

  let parsed: unknown
  try {
    parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
  } catch {
    return null
  }
  if (typeof parsed !== 'object' || parsed === null) return null
  const { uid, iat } = parsed as Partial<RecoveryMarkerPayload>
  if (typeof uid !== 'string' || uid.length === 0 || typeof iat !== 'number' || !Number.isFinite(iat)) return null

  const age = now - iat
  if (age > RECOVERY_MARKER_MAX_AGE_SECONDS * 1000 || age < -CLOCK_SKEW_MS) return null
  return uid
}

export function recoveryMarkerCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    // Strict is safe here: the marker is only ever read by a same-site POST (the reset
    // form's server action). Setting it on the cross-site recovery navigation works;
    // only sending it cross-site is withheld, which is the point.
    sameSite: 'strict' as const,
    path: '/reset-password',
    maxAge: RECOVERY_MARKER_MAX_AGE_SECONDS,
  }
}

/** Sets the marker on a response. Returns false when no signing secret is configured. */
export function setRecoveryMarker(response: NextResponse, userId: string): boolean {
  const token = signRecoveryMarker(userId)
  if (!token) return false
  response.cookies.set(RECOVERY_MARKER_COOKIE, token, recoveryMarkerCookieOptions())
  return true
}
