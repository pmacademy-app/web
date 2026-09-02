'use server'

import { cookies } from 'next/headers'
import { createClient } from '@supabase/supabase-js'
import { createAuthenticatedServerClient } from '@/lib/supabase'

export async function updatePasswordAction(newPassword: string) {
  try {
    const cookieStore = await cookies()
    const accessToken = cookieStore.get('sb-access-token')?.value
    const refreshToken = cookieStore.get('sb-refresh-token')?.value

    if (!accessToken && !refreshToken) {
      return { error: 'No active recovery session found. Please request a new password reset link.' }
    }

    // Try with access token first
    if (accessToken) {
      const userClient = createAuthenticatedServerClient(accessToken)
      const { error } = await userClient.auth.updateUser({ password: newPassword })

      if (!error) {
        // Clear the recovery session cookies
        cookieStore.delete('sb-access-token')
        cookieStore.delete('sb-refresh-token')
        return { success: true }
      }

      // If access token failed but we have no refresh token, report the error
      if (!refreshToken) {
        return { error: error.message || 'Failed to update password. Your reset link may have expired.' }
      }
      // Otherwise, fall through to refresh token fallback below
    }

    // Refresh-token fallback: exchange for a fresh access token
    if (refreshToken) {
      const refreshClient = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        { auth: { persistSession: false } }
      )
      const { data: refreshData, error: refreshError } = await refreshClient.auth.refreshSession({
        refresh_token: refreshToken,
      })

      if (refreshError || !refreshData?.session) {
        cookieStore.delete('sb-access-token')
        cookieStore.delete('sb-refresh-token')
        return { error: 'Your password reset link has expired. Please request a new one.' }
      }

      const retryClient = createAuthenticatedServerClient(refreshData.session.access_token)
      const { error: retryError } = await retryClient.auth.updateUser({ password: newPassword })

      if (retryError) {
        return { error: retryError.message || 'Failed to update password. Your reset link may have expired.' }
      }
    }

    // Clear the recovery session cookies
    cookieStore.delete('sb-access-token')
    cookieStore.delete('sb-refresh-token')
    return { success: true }
  } catch (err) {
    console.error('[updatePasswordAction] Error:', err)
    return { error: 'An unexpected error occurred.' }
  }
}
