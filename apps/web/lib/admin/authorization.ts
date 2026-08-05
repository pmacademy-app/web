import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase'

/**
 * Whether an email is listed in the ADMIN_EMAILS environment variable.
 *
 * Parsing rules (shared by middleware, server guards, and API routes):
 * - comma-separated list
 * - whitespace trimmed from every entry
 * - empty entries filtered out
 * - comparison is case-insensitive
 */
export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false

  const adminEmails = (process.env.ADMIN_EMAILS || '')
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean)

  return adminEmails.length > 0 && adminEmails.includes(email.toLowerCase())
}

/**
 * Resolves whether a user holds administrator authorization.
 *
 * Access is granted when EITHER of the following holds:
 *  1. The user's email is listed in ADMIN_EMAILS, or
 *  2. The user's `users.is_admin` database flag is true.
 *
 * The Supabase client must be scoped to the requesting user (their own access
 * token) so Row Level Security permits reading the user's own row. The service
 * role client also works for server-side guards.
 */
export async function isAdminUser(
  supabase: SupabaseClient<Database>,
  userId: string,
  email?: string | null
): Promise<boolean> {
  if (isAdminEmail(email)) return true

  const { data } = await supabase
    .from('users')
    .select('is_admin')
    .eq('id', userId)
    .maybeSingle()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const row = data as unknown as { is_admin?: boolean } | null
  return Boolean(row?.is_admin)
}
