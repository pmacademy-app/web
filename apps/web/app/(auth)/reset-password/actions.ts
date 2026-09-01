'use server'

import { cookies } from 'next/headers'
import { createAuthenticatedServerClient } from '@/lib/supabase'

export async function updatePasswordAction(newPassword: string) {
  try {
    const cookieStore = await cookies()
    const accessToken = cookieStore.get('sb-access-token')?.value

    if (!accessToken) {
      return { error: 'No active recovery session found. Please request a new password reset link.' }
    }

    const userClient = createAuthenticatedServerClient(accessToken)
    const { error } = await userClient.auth.updateUser({ password: newPassword })

    if (error) {
      return { error: error.message || 'Failed to update password. Your reset link may have expired.' }
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
