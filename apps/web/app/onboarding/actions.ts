'use server'

import { cookies } from 'next/headers'
import { createClient } from '@supabase/supabase-js'
import { createServiceRoleClient } from '@/lib/supabase'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export interface OnboardingData {
  name: string
  username: string
  avatar_url?: string | null
  bio?: string
  career_role?: string // Experience level / Role
  goal?: string // Primary goal
  topics?: string[] // Multiple selected interests
  learning_preference?: string // Preferred learning style
  linkedin_url?: string
  twitter_url?: string
  github_url?: string
  website_url?: string
}

export async function checkUsernameAvailability(rawUsername: string, currentUserId?: string): Promise<{ available: boolean; error?: string }> {
  try {
    const username = rawUsername.trim().toLowerCase()
    if (!username) {
      return { available: false, error: 'Username is required.' }
    }
    if (username.length < 3) {
      return { available: false, error: 'Username must be at least 3 characters.' }
    }
    if (username.length > 24) {
      return { available: false, error: 'Username must be at most 24 characters.' }
    }
    if (!/^[a-z0-9_]+$/.test(username)) {
      return { available: false, error: 'Username can only contain lowercase letters, numbers, and underscores.' }
    }

    const dbSupabase = createServiceRoleClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let query = (dbSupabase.from('users') as any).select('id').eq('username', username)
    if (currentUserId) {
      query = query.neq('id', currentUserId)
    }

    const { data, error } = await query.maybeSingle()
    if (error) {
      console.error('[checkUsernameAvailability] DB query error:', error.message)
      return { available: true } // Non-blocking on query error
    }

    if (data) {
      return { available: false, error: 'This username is already taken. Please choose another.' }
    }

    return { available: true }
  } catch (err) {
    console.error('[checkUsernameAvailability] Exception:', err)
    return { available: true }
  }
}

export async function submitOnboarding(data: OnboardingData) {
  try {
    const cookieStore = await cookies()
    const accessToken = cookieStore.get('sb-access-token')?.value
    let refreshToken = cookieStore.get('sb-refresh-token')?.value

    if (!accessToken && !refreshToken) {
      return { error: 'Unauthorized: No active session' }
    }

    // Verify token & resolve user ID
    const authSupabase = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: false },
    })

    let userId: string | null = null

    if (accessToken) {
      const { data: { user }, error: authError } = await authSupabase.auth.getUser(accessToken)
      if (!authError && user?.id) {
        userId = user.id
      }
    }

    // Fallback: If access token is expired/invalid, refresh session to authenticate
    if (!userId && refreshToken) {
      const { data: refreshData, error: refreshError } = await authSupabase.auth.refreshSession({
        refresh_token: refreshToken,
      })
      if (!refreshError && refreshData?.session?.user) {
        userId = refreshData.session.user.id
        refreshToken = refreshData.session.refresh_token
      }
    }

    if (!userId) {
      return { error: 'Unauthorized: Invalid session' }
    }

    // Server-side validation
    const username = (data.username || '').trim().toLowerCase()
    if (!username) {
      return { error: 'Username is required.' }
    }
    if (username.length < 3 || username.length > 24 || !/^[a-z0-9_]+$/.test(username)) {
      return { error: 'Username must be 3–24 characters and only contain letters, numbers, and underscores.' }
    }

    const name = (data.name || '').trim()
    if (!name) {
      return { error: 'Display name is required.' }
    }

    const dbSupabase = createServiceRoleClient()

    // Assemble learning purpose composite
    const topicsStr = Array.isArray(data.topics) && data.topics.length > 0 ? data.topics.join(', ') : ''
    const prefStr = data.learning_preference ? `Preference: ${data.learning_preference}` : ''
    const compositeLearningPurpose = [
      topicsStr ? `Interests: ${topicsStr}` : '',
      prefStr,
    ].filter(Boolean).join(' | ') || null

    // Normalize website / portfolio / social URL
    const websiteUrl = data.website_url?.trim() || (data.twitter_url ? `https://x.com/${data.twitter_url.replace(/^@/, '').replace(/^https?:\/\/(www\.)?(twitter|x)\.com\//, '')}` : null)

    // 1. Update public.users table with chosen fields
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: dbError } = await (dbSupabase.from('users') as any).update({ 
      name,
      username,
      avatar_url: data.avatar_url?.trim() || null,
      bio: data.bio?.trim() || null,
      career_role: data.career_role?.trim() || null,
      goal: data.goal?.trim() || null,
      learning_purpose: compositeLearningPurpose,
      // Structured columns for precise broadcast filtering
      onboarding_topics: Array.isArray(data.topics) && data.topics.length > 0 ? data.topics : [],
      onboarding_preference: data.learning_preference?.trim() || null,
      linkedin_url: data.linkedin_url?.trim() || null,
      github_url: data.github_url?.trim() || null,
      website_url: websiteUrl,
      onboarding_completed: true 
    }).eq('id', userId)

    if (dbError) {
      console.error('[onboarding/actions] Database update error:', dbError.message)
      if (dbError.message.includes('unique constraint') || dbError.code === '23505') {
        return { error: 'Username is already taken. Please choose another.' }
      }
      return { error: 'Failed to save profile information. Please try again.' }
    }

    // 2. Update auth metadata so middleware and JWT reflect onboarding_complete and preferences
    const { error: metaError } = await dbSupabase.auth.admin.updateUserById(userId, {
      user_metadata: {
        full_name: name,
        username,
        avatar_url: data.avatar_url || undefined,
        career_role: data.career_role || undefined,
        goal: data.goal || undefined,
        topics: data.topics || undefined,
        learning_preference: data.learning_preference || undefined,
        onboarding_complete: true,
      },
    })

    if (metaError) {
      console.error('[onboarding/actions] Metadata update error:', metaError.message)
    }

    // 3. Refresh user session to mint a new JWT with updated user_metadata and persist to HTTP-only cookies
    if (refreshToken) {
      const { data: refreshData, error: refreshError } = await authSupabase.auth.refreshSession({
        refresh_token: refreshToken,
      })

      if (!refreshError && refreshData?.session) {
        const isProd = process.env.NODE_ENV === 'production'
        cookieStore.set('sb-access-token', refreshData.session.access_token, {
          httpOnly: true,
          secure: isProd,
          sameSite: 'lax',
          path: '/',
          maxAge: refreshData.session.expires_in || 3600,
        })
        cookieStore.set('sb-refresh-token', refreshData.session.refresh_token, {
          httpOnly: true,
          secure: isProd,
          sameSite: 'lax',
          path: '/',
          maxAge: 60 * 60 * 24 * 30, // 30 days
        })
      }
    }

    return { success: true }
  } catch (err) {
    console.error('[onboarding/actions] Unexpected error:', err)
    return { error: 'An unexpected error occurred. Please try again.' }
  }
}
