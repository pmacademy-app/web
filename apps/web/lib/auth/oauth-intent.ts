import { createHmac, timingSafeEqual } from 'node:crypto'

/**
 * The signed intent a Google sign-in carries through the provider round trip.
 *
 * The signup page collects Terms and age consent, a referral code and a return path
 * before the user leaves for Google. None of that can ride on the redirect URL (the
 * Supabase allowlist matches the query string, and anything in it is user-editable),
 * so the start route signs it into the `prodily_oauth_intent` cookie and the callback
 * verifies it. A forged or stale cookie verifies to null and the callback refuses.
 *
 * Format: `${base64url(json)}.${base64url(hmacSha256(secret, base64url(json)))}`.
 * Server only: the secret is `OAUTH_STATE_SECRET` and must never reach the client.
 */

export interface OAuthIntent {
  terms: boolean
  age: boolean
  ref: string | null
  next: string
  iat: number
}

export const OAUTH_INTENT_MAX_AGE_MS = 600_000

/** Allowed clock drift between the instance that signed and the one that verifies. */
const CLOCK_SKEW_MS = 30_000

const MIN_SECRET_LENGTH = 32
const MAX_NEXT_LENGTH = 512
const BASE64URL = /^[A-Za-z0-9_-]+$/
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/

export function getOAuthStateSecret(): string | null {
  const secret = process.env.OAUTH_STATE_SECRET
  if (!secret || secret.length < MIN_SECRET_LENGTH) return null
  return secret
}

function hmac(payload: string, secret: string): Buffer {
  return createHmac('sha256', secret).update(payload).digest()
}

export function signOAuthIntent(intent: OAuthIntent, secret: string): string {
  const payload = Buffer.from(JSON.stringify(intent), 'utf8').toString('base64url')
  return `${payload}.${hmac(payload, secret).toString('base64url')}`
}

function isIntentShape(value: unknown): value is OAuthIntent {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const v = value as Record<string, unknown>
  return (
    typeof v.terms === 'boolean' &&
    typeof v.age === 'boolean' &&
    (v.ref === null || typeof v.ref === 'string') &&
    typeof v.next === 'string' &&
    typeof v.iat === 'number' &&
    Number.isFinite(v.iat)
  )
}

export function verifyOAuthIntent(token: string, secret: string, now: number = Date.now()): OAuthIntent | null {
  if (typeof token !== 'string' || !secret) return null
  const parts = token.split('.')
  if (parts.length !== 2) return null
  const [payload, signature] = parts
  if (!payload || !signature || !BASE64URL.test(payload) || !BASE64URL.test(signature)) return null

  const expected = hmac(payload, secret)
  const provided = Buffer.from(signature, 'base64url')
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) return null

  let parsed: unknown
  try {
    parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
  } catch {
    return null
  }
  if (!isIntentShape(parsed)) return null

  const age = now - parsed.iat
  if (age > OAUTH_INTENT_MAX_AGE_MS || age < -CLOCK_SKEW_MS) return null

  // The signer sanitized `next` already; doing it again means a future signer bug
  // cannot turn into an open redirect.
  return {
    terms: parsed.terms,
    age: parsed.age,
    ref: parsed.ref,
    next: sanitizeNextPath(parsed.next),
    iat: parsed.iat,
  }
}

/**
 * A same-origin path to land on after sign-in, or `fallback`.
 *
 * Rejects anything a browser could resolve off-origin (`//host`, `/\host`, absolute
 * URLs, any backslash), control characters, and API paths (a redirect into an API
 * route is never a page the user meant to see).
 */
export function sanitizeNextPath(raw: string | null | undefined, fallback: string = '/dashboard'): string {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > MAX_NEXT_LENGTH) return fallback
  if (raw[0] !== '/' || raw[1] === '/' || raw.includes('\\')) return fallback
  if (CONTROL_CHARS.test(raw)) return fallback
  const lower = raw.toLowerCase()
  if (lower === '/api' || lower.startsWith('/api/') || lower.startsWith('/api?') || lower.startsWith('/api#')) {
    return fallback
  }
  return raw
}
