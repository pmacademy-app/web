import { createClient } from '@supabase/supabase-js'
import { createServiceRoleClient } from '@/lib/supabase'
import { log } from '@/lib/monitoring/log'

export type RevocationOutcome = 'revoked' | 'skipped' | 'failed'

/**
 * Ends one session at the provider before its cookies are cleared (L4).
 *
 * Same logic as `POST /api/auth/session`: the refresh token is exchanged for an access
 * token the provider accepts, then signed out with the `local` scope, which revokes just
 * this refresh token family (one browser logging out, not every device). An already
 * invalid refresh token is the desired end state and counts as revoked.
 *
 * A caller with only a Bearer access token (a native client) has no refresh token here,
 * so the access token's session is revoked through the Admin API instead.
 *
 * Never throws: failing to reach the provider must not stop the cookies being cleared.
 */
export async function revokeSession(tokens: {
  refreshToken?: string | null
  accessToken?: string | null
}): Promise<RevocationOutcome> {
  const { refreshToken, accessToken } = tokens
  try {
    if (refreshToken) {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
      const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
      if (!supabaseUrl || !supabaseAnonKey) return 'skipped'
      const client = createClient(supabaseUrl, supabaseAnonKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      })
      const { data, error } = await client.auth.refreshSession({ refresh_token: refreshToken })
      if (!error && data.session) {
        await client.auth.signOut({ scope: 'local' })
      }
      return 'revoked'
    }

    if (accessToken) {
      const { error } = await createServiceRoleClient().auth.admin.signOut(accessToken, 'local')
      // An expired or unknown token has no session left to end.
      return error && error.status !== 401 && error.status !== 403 && error.status !== 404 ? 'failed' : 'revoked'
    }

    return 'skipped'
  } catch (err) {
    log.warnException('auth.session.revoke_failed', err)
    return 'failed'
  }
}
