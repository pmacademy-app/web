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
      try {
        await fetch('/api/auth/session', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ session }),
        })

        // Refresh Server Components layout/data on major auth events
        if (event === 'SIGNED_IN' || event === 'SIGNED_OUT') {
          router.refresh()
        }
      } catch (err) {
        console.error('[AuthStateListener] Error syncing session:', err)
      }
    })

    return () => {
      subscription.unsubscribe()
    }
  }, [router])

  return null
}
