/**
 * Supabase client factory.
 *
 * - createServerSupabaseClient() — uses SERVICE_ROLE_KEY (server-only, bypasses RLS)
 *   Use ONLY in app/api/ route handlers. Never import in client components.
 *
 * - createBrowserSupabaseClient() — uses ANON_KEY (safe for browser)
 *   Reserved for future authenticated client-side use.
 */

import { createClient } from '@supabase/supabase-js'

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

// Type-safe database schema (extend as tables are added)
export type Database = {
  public: {
    Tables: {
      waitlist: {
        Row: {
          id: string
          name: string
          email: string
          current_role: string
          source: string
          utm_source: string | null
          utm_medium: string | null
          utm_campaign: string | null
          referrer: string | null
          created_at: string
        }
        Insert: {
          id?: string
          name: string
          email: string
          current_role: string
          source?: string
          utm_source?: string | null
          utm_medium?: string | null
          utm_campaign?: string | null
          referrer?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          name?: string
          email?: string
          current_role?: string
          source?: string
          utm_source?: string | null
          utm_medium?: string | null
          utm_campaign?: string | null
          referrer?: string | null
          created_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

/**
 * Server-side Supabase client using the service role key.
 * ONLY for use in API route handlers — never in client components.
 */
export function createServerSupabaseClient() {
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

/**
 * Browser-side Supabase client using the anon key.
 * Safe for client components. Reserved for future authenticated features.
 */
export function createBrowserSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !anonKey) {
    throw new Error(
      'Missing Supabase environment variables. ' +
      'Ensure NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are set.'
    )
  }

  return createClient<Database>(supabaseUrl, anonKey)
}
