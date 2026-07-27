import { SupabaseClient, User } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase'

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
    return existing
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

  return inserted
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
