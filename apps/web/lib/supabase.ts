/**
 * Supabase client factory & type-safe Database definitions.
 *
 * - createServiceRoleClient() — uses SERVICE_ROLE_KEY (server-only, bypasses RLS)
 *   Use ONLY in app/api/ route handlers. Never import in client components.
 *
 * - createBrowserSupabaseClient() — uses ANON_KEY (safe for browser). Holds no session:
 *   B13-A disabled `persistSession`, so this client is for anonymous provider calls
 *   only (password-reset requests). Anything needing a session goes through the server.
 */

import { createClient } from '@supabase/supabase-js'
import type { Database } from '../types/database'

export type { Database, Json } from '../types/database'

export type Tables<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Row']
export type TablesInsert<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Insert']
export type TablesUpdate<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Update']
export type Enums<T extends keyof Database['public']['Enums']> = Database['public']['Enums'][T]


/**
 * Creates a Supabase client with the SERVICE_ROLE_KEY.
 * This client bypasses all Row Level Security (RLS) policies.
 * ONLY use this for backend administrative tasks or when RLS bypass is explicitly required.
 * Do not use this to fetch data on behalf of a specific user.
 */
export function createServiceRoleClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      'Missing Supabase environment variables. ' +
      'Ensure NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set.'
    )
  }

  if (
    (process.env.NODE_ENV === 'test' || process.env.VITEST === 'true') &&
    process.env.ALLOW_TEST_DB_ACCESS !== 'true'
  ) {
    console.warn(
      '[supabase] WARNING: createServiceRoleClient initialized in test environment with live credentials. Ensure database calls are properly mocked in unit tests.'
    )
  }

  return createClient<Database>(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  })
}



let globalBrowserSupabaseClient: ReturnType<typeof createClient<Database>> | null = null

export function createBrowserSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !anonKey) {
    throw new Error(
      'Missing Supabase environment variables. ' +
      'Ensure NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are set.'
    )
  }

  if (!globalBrowserSupabaseClient) {
    globalBrowserSupabaseClient = createClient<Database>(supabaseUrl, anonKey, {
      // B13-A — httpOnly cookies are the only session store for the web.
      //
      // supabase-js defaults to `persistSession: true`, which writes the access *and*
      // refresh token into localStorage. F-02: that made the httpOnly cookie
      // decorative — the same refresh token sat in a store any script on the origin
      // could read — and let the two copies drift apart, with no way for a native
      // client to participate in either.
      //
      // With persistence off there is no second store to diverge from. The server
      // owns the session end to end: the auth routes set the cookies, and `proxy.ts`
      // exchanges an expired access token for a fresh pair on the next request, which
      // is what `autoRefreshToken` used to do in the browser. Turning that off here is
      // not a loss of refresh — it is a move of refresh to the side that holds the
      // credential.
      //
      // `detectSessionInUrl` is off because this app never completes an auth flow in
      // the browser. Recovery and verification links are `token_hash` URLs pointing at
      // `/api/auth/callback`, which calls `verifyOtp` server-side and sets the cookies
      // on the redirect. Leaving it on would have the client try to claim a session
      // from a URL it will never see.
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    })
  }

  return globalBrowserSupabaseClient
}

/**
 * Creates a user-scoped Supabase client that authenticates via an access token.
 * This client respects Row Level Security (RLS) policies for the authenticated user.
 * Use this in API routes or server actions when acting on behalf of a user.
 */
export function createAuthenticatedServerClient(accessToken: string) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !anonKey) {
    throw new Error(
      'Missing Supabase environment variables. ' +
      'Ensure NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are set.'
    )
  }

  return createClient<Database>(supabaseUrl, anonKey, {
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
    auth: { persistSession: false },
  })
}

