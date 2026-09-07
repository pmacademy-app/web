'use server'

import { cookies } from 'next/headers'
import { createClient } from '@supabase/supabase-js'
import { createServiceRoleClient } from '@/lib/supabase'
import { classifyAuthError } from '@/lib/auth/errors'

export async function updatePasswordAction(newPassword: string) {
  try {
    const cookieStore = await cookies()
    const accessToken = cookieStore.get('sb-access-token')?.value
    const refreshToken = cookieStore.get('sb-refresh-token')?.value

    if (!accessToken && !refreshToken) {
      return {
        error: 'No active recovery session found. Please request a new password reset link.',
        code: 'AUTH_SESSION_SYNC_FAILED' as const,
      }
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

    let userId: string | null = null

    // Step 1: Explicitly validate the access token by passing it directly to getUser(accessToken).
    // This makes the authorization chain explicit:
    // HttpOnly access-token cookie -> getUser(accessToken) -> Supabase validates JWT -> validated user.id -> admin.updateUserById()
    if (accessToken) {
      try {
        const verifyClient = createClient(supabaseUrl, anonKey, {
          auth: { persistSession: false },
        })
        const { data: { user }, error } = await verifyClient.auth.getUser(accessToken)
        if (!error && user?.id) {
          userId = user.id
        }
      } catch {
        // Access token verification failed; fall through to refresh below
      }
    }

    // Step 2: If access token is expired/invalid, refresh to get the user ID.
    // The refresh token is read STRICTLY from the HttpOnly 'sb-refresh-token' cookie
    // and cannot be supplied by any client-controlled parameter.
    if (!userId && refreshToken) {
      const refreshClient = createClient(supabaseUrl, anonKey, {
        auth: { persistSession: false },
      })
      const { data: refreshData, error: refreshError } = await refreshClient.auth.refreshSession({
        refresh_token: refreshToken,
      })

      if (refreshError || !refreshData?.session?.user) {
        cookieStore.delete('sb-access-token')
        cookieStore.delete('sb-refresh-token')
        return {
          error: 'Your password reset link has expired. Please request a new one.',
          code: 'AUTH_SESSION_SYNC_FAILED' as const,
        }
      }

      userId = refreshData.session.user.id
    }

    if (!userId) {
      cookieStore.delete('sb-access-token')
      cookieStore.delete('sb-refresh-token')
      return {
        error: 'Your password reset link has expired. Please request a new one.',
        code: 'AUTH_SESSION_SYNC_FAILED' as const,
      }
    }

    // Step 3: Use the Admin API to update the password for the validated user ID.
    // This is the same approach used by Settings -> Security (api/settings/security/route.ts).
    const adminClient = createServiceRoleClient()
    const { error: updateError } = await adminClient.auth.admin.updateUserById(userId, {
      password: newPassword,
    })

    if (updateError) {
      console.error('[updatePasswordAction] Admin update error:', updateError.message)
      // Return classifier copy, not the provider's message. The raw GoTrue string was
      // never rendered (the page classifies before display), but returning it sent it
      // across to the browser, where it is visible in the network response. Same
      // contract the API routes use: a stable code plus copy we wrote.
      const classified = classifyAuthError(updateError, 'reset_password')
      return { error: classified.message, code: classified.code }
    }

    // Clear the recovery session cookies after a successful update
    cookieStore.delete('sb-access-token')
    cookieStore.delete('sb-refresh-token')
    return { success: true }
  } catch (err) {
    console.error('[updatePasswordAction] Unexpected error:', err)
    return { error: 'An unexpected error occurred.', code: 'AUTH_UNKNOWN_ERROR' as const }
  }
}

