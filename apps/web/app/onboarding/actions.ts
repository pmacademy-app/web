'use server'

import { cookies } from 'next/headers'
import { createClient } from '@supabase/supabase-js'
import { createServiceRoleClient } from '@/lib/supabase'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export interface OnboardingData {
  name?: string
  username?: string
  avatar_url?: string | null
  career_role?: string
  goal?: 'job_search' | 'fill_gaps' | 'exploring'
  learning_purpose?: string
  linkedin_url?: string
  website_url?: string
}

export async function submitOnboarding(data: OnboardingData) {
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
    const dbSupabase = createServiceRoleClient() // service role

    // 1. Update public.users table with chosen fields
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: dbError } = await (dbSupabase.from('users') as any).update({ 
      name: data.name,
      username: data.username,
      avatar_url: data.avatar_url,
      career_role: data.career_role,
      learning_purpose: data.learning_purpose,
      goal: data.goal,
      linkedin_url: data.linkedin_url,
      website_url: data.website_url,
      onboarding_completed: true 
    }).eq('id', userId)

    if (dbError) {
      console.error('[onboarding/actions] Database update error:', dbError.message)
      // Check if unique constraint on username failed
      if (dbError.message.includes('unique constraint') || dbError.code === '23505') {
        return { error: 'Username is already taken. Please choose another.' }
      }
      return { error: 'Failed to save profile information.' }
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
