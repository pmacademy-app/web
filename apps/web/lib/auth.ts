import { SupabaseClient, User } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase'
import { cookies } from 'next/headers'
import { createAuthenticatedServerClient } from './supabase'
import { globalNotificationDispatcher } from './notifications/dispatcher'
import { initializeNotificationConnectors } from './notifications/events/connectors'

export type UserProfile = Database['public']['Tables']['users']['Row']

/**
 * Ensures a user record exists in the public `users` table upon authentication.
 * If the user record doesn't exist, it creates one with default values.
 */
export async function ensureUserProfile(
  supabase: SupabaseClient<Database>,
  user: User,
  extra?: { name?: string; timezone?: string; provider?: string }
): Promise<UserProfile | null> {
  const { data: existing } = await supabase
    .from('users')
    .select('*')
    .eq('id', user.id)
    .maybeSingle()

  if (existing) {
    const profile = existing as unknown as UserProfile
    await dispatchWelcomeEmailIfNeeded(supabase, user, profile.name, profile.timezone)
    return profile
  }

  const name = extra?.name ?? user.user_metadata?.full_name ?? user.user_metadata?.name ?? null
  const provider = extra?.provider ?? user.app_metadata?.provider ?? 'email'
  const timezone = extra?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'UTC'

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: inserted, error } = await (supabase.from('users') as any)
    .insert({
      id: user.id,
      email: user.email ?? '',
      name,
      auth_provider: provider,
      timezone,
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

  await dispatchWelcomeEmailIfNeeded(supabase, user, name, timezone)
  return inserted
}

/**
 * Dispatches welcome email for newly registered or newly verified user.
 * Idempotency key `welcome-${user.id}` guarantees exactly-once queueing.
 */
async function dispatchWelcomeEmailIfNeeded(
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
 * Never trust user_id from client request body — always use this function.
 */
export async function getAuthenticatedUser(supabase: SupabaseClient<Database>): Promise<User | null> {
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) {
    return null
  }
  return user
}

/**
 * Server-side helper to verify auth session directly from request cookies.
 * Extracts sb-access-token and returns the authenticated Supabase User or null.
 */
export async function getServerUser(): Promise<User | null> {
  try {
    const cookieStore = await cookies()
    const accessToken = cookieStore.get('sb-access-token')?.value
    if (!accessToken) return null

    const authClient = createAuthenticatedServerClient(accessToken)
    return await getAuthenticatedUser(authClient)
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
 * Unified API route authentication helper.
 * Extracts token from either:
 * 1. `Authorization: Bearer <token>` header
 * 2. Request cookies (`sb-access-token`)
 *
 * Logs step-by-step trace information for production debugging.
 */
export async function getAuthenticatedUserFromRequest(request: Request): Promise<User | null> {
  // 1. Log cookies received
  const cookieHeader = request.headers.get('cookie') || ''
  const hasCookieHeader = Boolean(cookieHeader)

  let token: string | null = null
  let tokenSource: 'authorization_header' | 'cookie' | 'none' = 'none'

  // Check Authorization header
  const authHeader = request.headers.get('Authorization')
  if (authHeader?.startsWith('Bearer ')) {
    token = authHeader.substring(7).trim()
    tokenSource = 'authorization_header'
  }

  // Fallback: Check sb-access-token cookie
  if (!token) {
    try {
      const cookieStore = await cookies()
      const sbToken = cookieStore.get('sb-access-token')?.value
      if (sbToken) {
        token = sbToken
        tokenSource = 'cookie'
      }
    } catch {
      // Manual cookie header parsing fallback if cookies() unavailable
      const match = cookieHeader.match(/sb-access-token=([^;]+)/)
      if (match && match[1]) {
        token = decodeURIComponent(match[1])
        tokenSource = 'cookie'
      }
    }
  }

  console.log('[auth-trace] Step 1 - Cookies received:', {
    hasCookieHeader,
    cookieHeaderSnippet: cookieHeader ? `${cookieHeader.substring(0, 40)}...` : 'none',
  })

  console.log('[auth-trace] Step 2 - Authenticated session:', {
    tokenSource,
    hasToken: Boolean(token),
  })

  if (!token) {
    console.warn('[auth-trace] Step 3 - Authenticated user: null (No token found in header or cookies)')
    return null
  }

  // 3. Supabase client initialization & verification
  console.log('[auth-trace] Step 4 - Supabase client initialization:', {
    clientType: 'createAuthenticatedServerClient',
  })

  const authClient = createAuthenticatedServerClient(token)
  const { data: { user }, error: userError } = await authClient.auth.getUser()

  if (userError || !user) {
    console.warn('[auth-trace] Step 3 - Authenticated user: null', {
      errorMsg: userError?.message ?? 'User not found for token',
    })
    return null
  }

  console.log('[auth-trace] Step 3 - Authenticated user: success', {
    userId: user.id,
    email: user.email,
  })

  return user
}

/**
 * Checks if the user profile has completed onboarding (i.e. has a goal set).
 */
export function isProfileComplete(profile: UserProfile): boolean {
  return !!profile.goal
}
