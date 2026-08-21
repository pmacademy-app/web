/**
 * Supabase client factory & type-safe Database definitions.
 *
 * - createServiceRoleClient() — uses SERVICE_ROLE_KEY (server-only, bypasses RLS)
 *   Use ONLY in app/api/ route handlers. Never import in client components.
 *
 * - createBrowserSupabaseClient() — uses ANON_KEY (safe for browser)
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
    globalBrowserSupabaseClient = createClient<Database>(supabaseUrl, anonKey)
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

