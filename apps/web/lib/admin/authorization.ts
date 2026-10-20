import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase'

/**
 * Resolves whether a user holds administrator authorization.
 *
 * Admin status comes only from the `users.is_admin` database flag. Email
 * addresses never grant admin access. A read error or a missing row is treated
 * as "not an admin" (fail closed).
 *
 * The Supabase client must be scoped to the requesting user (their own access
 * token) so Row Level Security permits reading the user's own row. The service
 * role client also works for server-side guards.
 */
export async function isAdminUser(
  supabase: SupabaseClient<Database>,
  userId: string
): Promise<boolean> {
  if (!userId) return false

  const { data, error } = await supabase
    .from('users')
    .select('is_admin')
    .eq('id', userId)
    .maybeSingle()

  if (error || !data) return false

  const row = data as unknown as { is_admin?: boolean }
  return row.is_admin === true
}
