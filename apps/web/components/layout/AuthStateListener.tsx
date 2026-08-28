'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createBrowserSupabaseClient } from '@/lib/supabase'

export default function AuthStateListener() {
  const router = useRouter()

  useEffect(() => {
    const supabase = createBrowserSupabaseClient()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      // Only sync session when an active session is provided by a sign-in or token refresh event.
      // NEVER clear server-side HTTP-only cookies on INITIAL_SESSION or when session is null in browser localStorage.
      if (session && (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED')) {
        try {
          await fetch('/api/auth/session', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ session }),
          })

          if (event === 'SIGNED_IN') {
            router.refresh()
          }
        } catch (err) {
          console.error('[AuthStateListener] Error syncing session:', err)
        }
      }
    })

    return () => {
      subscription.unsubscribe()
    }
  }, [router])

  return null
}
