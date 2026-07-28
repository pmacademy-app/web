'use server'

import { cookies } from 'next/headers'
import { createClient } from '@supabase/supabase-js'
import { createServerSupabaseClient } from '@/lib/supabase'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export async function submitOnboarding(goal: 'job_search' | 'fill_gaps' | 'exploring') {
  try {
    const cookieStore = await cookies()
    const accessToken = cookieStore.get('sb-access-token')?.value

    if (!accessToken) {
      return { error: 'Unauthorized: No active session' }
    }

    // Verify token & resolve user ID
    const authSupabase = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: false },
    })
    const { data: { user }, error: authError } = await authSupabase.auth.getUser(accessToken)

    if (authError || !user) {
      return { error: 'Unauthorized: Invalid session' }
    }

    const userId = user.id
    const dbSupabase = createServerSupabaseClient() // service role

    // 1. Update public.users table with chosen goal
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: dbError } = await (dbSupabase.from('users') as any).update({ goal }).eq('id', userId)

    if (dbError) {
      console.error('[onboarding/actions] Database update error:', dbError.message)
      return { error: 'Failed to save goal selection.' }
    }

    // 2. Update auth metadata so middleware can read onboarding_complete from JWT
    const { error: metaError } = await dbSupabase.auth.admin.updateUserById(userId, {
      user_metadata: { onboarding_complete: true },
    })

    if (metaError) {
      console.error('[onboarding/actions] Metadata update error:', metaError.message)
      return { error: 'Failed to update user profile metadata.' }
    }

    return { success: true }
  } catch (err) {
    console.error('[onboarding/actions] Unexpected error:', err)
    return { error: 'An unexpected error occurred. Please try again.' }
  }
}
