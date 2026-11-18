import { SupabaseClient, User } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase'
import { cookies } from 'next/headers'
import { createAuthenticatedServerClient, createServiceRoleClient } from './supabase'
import { globalNotificationDispatcher } from './notifications/dispatcher'
import { initializeNotificationConnectors } from './notifications/events/connectors'
import { consentFromAuthMetadata, type ConsentRecord } from './legal/consent'
import { trackProductEvent } from './events/product-events'
import { log } from './monitoring/log'

export type UserProfile = Database['public']['Tables']['users']['Row']

/**
 * The `app_metadata` key that carries a signup consent record written by the server.
 *
 * M4: consent is never recovered from `user_metadata`. GoTrue lets the account holder write
 * `user_metadata` (the `data` option of a direct `/auth/v1/signup` call with the public anon key,
 * or `auth.updateUser` later), so trusting it let anyone create an account outside the signup
 * route with a forged terms and age consent, which `ensureUserProfile` then recorded on first
 * login. `app_metadata` can only be written with the service role key (admin API), so a record
 * found here was put there by our own server.
 */
export const SIGNUP_CONSENT_APP_METADATA_KEY = 'signup_consent'

/**
 * Consent recorded server-side in `app_metadata.signup_consent`, or `null`.
 *
 * Reuses the shape check of `consentFromAuthMetadata`. Anything the account holder can write
 * (`user_metadata`) is ignored, even when it looks like a valid record.
 */
export function consentFromServerMetadata(user: Pick<User, 'app_metadata'>): ConsentRecord | null {
  const appMetadata: unknown = user.app_metadata
  if (!appMetadata || typeof appMetadata !== 'object') return null
  return consentFromAuthMetadata((appMetadata as Record<string, unknown>)[SIGNUP_CONSENT_APP_METADATA_KEY])
}

/**
 * Ensures a user record exists in the public `users` table upon authentication.
 * If the user record doesn't exist, it creates one with default values.
 */
export async function ensureUserProfile(
  supabase: SupabaseClient<Database>,
  user: User,
  extra?: {
    name?: string
    timezone?: string
    provider?: string
    /**
     * `undefined` (omitted): use the server-written `app_metadata.signup_consent`, if any
     * (never `user_metadata`, see `SIGNUP_CONSENT_APP_METADATA_KEY`).
     * `null`: no consent was given; the columns stay NULL even if metadata has some.
     */
    consent?: ConsentRecord | null
    /**
     * Do not send the welcome email now. Used for a Google sign-up that still owes
     * consent: the welcome goes out from the consent gate once they accept (see
     * `dispatchWelcomeEmailIfNeeded`), so a declined account never gets one.
     */
    skipWelcome?: boolean
  }
): Promise<UserProfile | null> {
  const { data: existing } = await supabase
    .from('users')
    .select('*')
    .eq('id', user.id)
    .maybeSingle()

  if (existing) {
    return existing as unknown as UserProfile
  }

  const name = extra?.name ?? user.user_metadata?.full_name ?? user.user_metadata?.name ?? null
  const provider = extra?.provider ?? user.app_metadata?.provider ?? 'email'
  const timezone = extra?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'UTC'

  // Signup consent. Flow B (verification OFF) hands it in directly. Every other caller
  // omits it, and the only carrier trusted here is `app_metadata.signup_consent`, which
  // only the service role can write. `user_metadata` is NOT read (M4): the account
  // holder controls it, so a direct GoTrue signup could forge a consent record. `null`
  // when nothing server-written exists (OAuth, legacy accounts, direct GoTrue signups,
  // and Flow A until the signup route writes app_metadata): the columns stay NULL
  // rather than recording a consent that did not happen.
  const consent = extra?.consent !== undefined ? extra.consent : consentFromServerMetadata(user)

  const { data: inserted, error } = await supabase
    .from('users')
    .insert({
      id: user.id,
      email: user.email ?? '',
      name,
      auth_provider: provider,
      timezone,
      ...(consent ?? {}),
      current_streak: 0,
      longest_streak: 0,
      streak_freezes_available: 0,
      total_xp: 0,
      level: 1,
    })
    .select()
    .single()

  if (error) {
    console.error('[auth] Error creating user profile:', error.message)
    return null
  }

  // PROD-15: one `signup` per new profile row. Only reached when this call inserted the row
  // (an existing row returns above; a lost insert race errors above), so a retry or a second
  // concurrent bootstrap never double-counts. Never throws.
  await trackProductEvent('signup', user.id, { provider })

  if (!extra?.skipWelcome) {
    await dispatchWelcomeEmailIfNeeded(supabase, user, name, timezone)
  }
  return inserted
}

/**
 * Dispatches welcome email for newly registered or newly verified user.
 * Idempotency key `welcome-${user.id}` guarantees exactly-once queueing.
 */
export async function dispatchWelcomeEmailIfNeeded(
  supabase: SupabaseClient<Database>,
  user: User,
  name?: string | null,
  timezone?: string
): Promise<void> {
  const email = user.email
  if (!email) return

  const userName = name || user.user_metadata?.full_name || user.user_metadata?.name || email.split('@')[0] || 'Learner'
  const userTz = timezone || 'UTC'

  try {
    initializeNotificationConnectors()
    await globalNotificationDispatcher.dispatch({
      id: `welcome-${user.id}`,
      event: 'user.registered',
      userId: user.id,
      userEmail: email,
      userName,
      userTimezone: userTz,
      priority: 'high',
      category: 'security',
      occurredAt: new Date().toISOString(),
      payload: {
        userId: user.id,
        email,
        userName,
      },
    })
  } catch (dispatchErr) {
    console.warn('[auth] Non-fatal notification dispatch error:', dispatchErr)
  }
}

/**
 * Server-side helper to verify auth session in API routes and server actions.
 * Never trust user_id from client request body: always use this function.
 */
export async function getAuthenticatedUser(supabase: SupabaseClient<Database>): Promise<User | null> {
  // Kept: callers passing an explicit client to getAuthenticatedUser(supabase) require
  // the fresh, complete User record directly from GoTrue (e.g. account settings and profile email display).
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) {
    return null
  }
  return user
}

import { cache } from 'react'

/**
 * Internal resolver to verify auth session directly from request cookies.
 * Extracts sb-access-token and returns the authenticated Supabase User or null.
 *
 * Perf plan item 2: the token is verified with getClaims() (the same check proxy.ts runs),
 * not getUser(), so an app page render no longer waits on a GoTrue round trip. The returned
 * User is built from the JWT claims (see userFromClaims). A caller that needs the fresh
 * GoTrue record (account settings, email change) calls getAuthenticatedUser(supabase).
 */
async function resolveServerUser(): Promise<User | null> {
  try {
    // CQ-10: this resolver only reads. Session refresh is owned by proxy.ts (and
    // /api/auth/refresh), which rotate the refresh token AND write the new pair back to the
    // browser. Refreshing here would rotate the token and throw the new one away, leaving the
    // browser holding a revoked refresh token. When the proxy has refreshed this request,
    // Next merges the cookies it set into cookies(), so the fresh access token is read here.
    const cookieStore = await cookies()
    const accessToken = cookieStore.get('sb-access-token')?.value
    if (!accessToken) return null

    return await verifyAccessToken(accessToken)
  } catch (err) {
    const error = err as Error & { digest?: string }
    if (error && (error.digest === 'DYNAMIC_SERVER_USAGE' || error.message?.includes('Dynamic server usage'))) {
      throw error
    }
    console.error('[auth] Error in getServerUser:', err)
    return null
  }
}

/**
 * Server-side helper to verify auth session directly from request cookies.
 * Memoized per server-request lifecycle using React cache().
 */
export const getServerUser = cache(resolveServerUser)

/**
 * Loads the authenticated user's `public.users` profile row.
 *
 * Memoized per server-request lifecycle via React cache(), so the shared
 * `(app)` layout and the page rendered beneath it collapse into a SINGLE
 * `users` SELECT instead of each issuing their own duplicate round-trip.
 *
 * Reads through the RLS-scoped authenticated client when an access token is
 * present (matching the layout's existing defense-in-depth), falling back to
 * the service-role client otherwise. Returns null when unauthenticated or the
 * row does not yet exist — callers own the ensureUserProfile() bootstrap path.
 * Throws ProfileReadError when the query itself fails, so a transient error is
 * never mistaken for a missing row.
 */
export const getCurrentUserProfile = cache(async (): Promise<UserProfile | null> => {
  const authUser = await getServerUser()
  if (!authUser) return null

  const cookieStore = await cookies()
  const accessToken = cookieStore.get('sb-access-token')?.value
  const supabase = accessToken
    ? createAuthenticatedServerClient(accessToken)
    : createServiceRoleClient()

  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('id', authUser.id)
    .maybeSingle()

  // A failed read is not "no profile". Returning null here sends the (app) layout and
  // the dashboard into ensureUserProfile() (re-creation) and, when that also fails,
  // a critical alert plus a redirect to /login. Throwing instead lets the error
  // boundary show a retry page; nothing is created or signed out on a DB blip.
  if (error) {
    log.error('auth.current_user_profile.read_failed', {
      userId: authUser.id,
      code: (error as { code?: string }).code ?? null,
    })
    throw new ProfileReadError()
  }

  return (data as UserProfile | null) ?? null
})

/** Thrown by getCurrentUserProfile when the profile read itself fails. */
export class ProfileReadError extends Error {
  constructor() {
    super('Could not load the user profile.')
    this.name = 'ProfileReadError'
  }
}

const requestAuthCache = new WeakMap<Request, Promise<User | null>>()

/**
 * Internal resolver for API route authentication helper.
 */
async function resolveAuthenticatedUserFromRequest(request: Request): Promise<User | null> {
  const cookieHeader = request.headers.get('cookie') || ''

  let token: string | null = null

  // Check Authorization header
  const authHeader = request.headers.get('Authorization')
  if (authHeader?.startsWith('Bearer ')) {
    token = authHeader.substring(7).trim()
  }

  // Fallback: the sb-access-token cookie. The raw request is read first; cookies() last,
  // because it is the only source that sees cookies the proxy set on this same request.
  let tokenFromRequest = false
  if (!token) {
    if ('cookies' in request && typeof (request as unknown as { cookies?: { get?: (k: string) => { value?: string } } }).cookies?.get === 'function') {
      token = (request as unknown as { cookies: { get: (k: string) => { value?: string } | undefined } }).cookies.get('sb-access-token')?.value || null
    }

    if (!token && cookieHeader) {
      const matchAccess = cookieHeader.match(/sb-access-token=([^;]+)/)
      if (matchAccess && matchAccess[1]) {
        token = decodeURIComponent(matchAccess[1].trim())
      }
    }

    tokenFromRequest = Boolean(token)
    if (!token) {
      token = await readAccessTokenFromCookieStore()
    }
  }

  if (token) {
    const user = await verifyAccessToken(token)
    if (user) return user
  }

  // CQ-10: no token refresh here. The proxy owns refresh and cookie writes (for pages, learner
  // APIs and /api/admin/*; /api/auth/* manages its own session): when it refreshes
  // a request it sets the new pair on the response, and Next merges those cookies into
  // cookies() for this same request. The raw request still carries the token the browser
  // sent, so if that one was rejected, retry once with the proxy-refreshed token.
  if (tokenFromRequest) {
    const refreshed = await readAccessTokenFromCookieStore()
    if (refreshed && refreshed !== token) {
      return verifyAccessToken(refreshed)
    }
  }

  return null
}

async function verifyAccessToken(token: string): Promise<User | null> {
  const authClient = createAuthenticatedServerClient(token)
  // ENG-03 / AG-16: fast path with getClaims()
  const authWithClaims = authClient.auth as unknown as {
    getClaims?: (token: string) => Promise<{ data: { claims?: Record<string, unknown> } | null; error: unknown }>
    getUser?: (token: string) => Promise<{ data: { user?: User | null } | null; error: unknown }>
  }
  if (typeof authWithClaims.getClaims === 'function') {
    const { data, error } = await authWithClaims.getClaims(token)
    if (!error && typeof data?.claims?.sub === 'string' && data.claims.sub) {
      return userFromClaims(data.claims)
    }
    return null
  }

  // Fallback to getUser(token) when getClaims is unavailable in legacy client or mock environments
  if (typeof authWithClaims.getUser === 'function') {
    const { data, error } = await authClient.auth.getUser(token)
    if (!error && data?.user) {
      return data.user
    }
  }

  return null
}

/**
 * Builds the User shape callers read from verified access-token claims.
 *
 * Provided: id, email, phone, app_metadata, user_metadata, aud, role, is_anonymous,
 * email_confirmed_at, created_at. Two fields are derived, not read:
 * - email_confirmed_at mirrors proxy.ts: a token that carries an email counts as confirmed,
 *   because GoTrue does not issue a session to an unconfirmed email while confirmations are on.
 * - created_at is the token issue time (claims carry no account creation date). Callers that
 *   need the account age read users.created_at from the profile row instead.
 * Not provided (absent from claims): last_sign_in_at, confirmed_at, identities, factors.
 */
function userFromClaims(claims: Record<string, unknown>): User {
  const email = typeof claims.email === 'string' && claims.email ? claims.email : undefined
  const issuedAt = new Date(typeof claims.iat === 'number' ? claims.iat * 1000 : Date.now()).toISOString()
  return {
    id: claims.sub as string,
    app_metadata: (claims.app_metadata as User['app_metadata']) || {},
    user_metadata: (claims.user_metadata as User['user_metadata']) || {},
    aud: typeof claims.aud === 'string' ? claims.aud : 'authenticated',
    created_at: issuedAt,
    email,
    phone: typeof claims.phone === 'string' && claims.phone ? claims.phone : undefined,
    role: typeof claims.role === 'string' ? claims.role : 'authenticated',
    is_anonymous: Boolean(claims.is_anonymous),
    email_confirmed_at:
      typeof claims.email_confirmed_at === 'string' ? claims.email_confirmed_at : email ? issuedAt : undefined,
  }
}

/** The access token from next/headers cookies(), or null outside a request scope. */
async function readAccessTokenFromCookieStore(): Promise<string | null> {
  try {
    const cookieStore = await cookies()
    return cookieStore.get('sb-access-token')?.value || null
  } catch {
    // Ignored if cookies() context is unavailable
    return null
  }
}

/**
 * Unified API route authentication helper.
 * Extracts token from Authorization header or cookies, deduplicated per-request instance via WeakMap.
 */
export async function getAuthenticatedUserFromRequest(request: Request): Promise<User | null> {
  const cached = requestAuthCache.get(request)
  if (cached) {
    return cached
  }

  const promise = resolveAuthenticatedUserFromRequest(request)
  requestAuthCache.set(request, promise)
  return promise
}

/**
 * Checks if the user profile has completed onboarding (i.e. has a goal set).
 */
export function isProfileComplete(profile: UserProfile): boolean {
  return !!profile.goal
}
