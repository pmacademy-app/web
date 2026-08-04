/**
 * Supabase client factory & type-safe Database definitions.
 *
 * - createServerSupabaseClient() — uses SERVICE_ROLE_KEY (server-only, bypasses RLS)
 *   Use ONLY in app/api/ route handlers. Never import in client components.
 *
 * - createBrowserSupabaseClient() — uses ANON_KEY (safe for browser)
 */

import { createClient } from '@supabase/supabase-js'

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      users: {
        Row: {
          id: string
          email: string
          name: string | null
          auth_provider: string
          timezone: string
          goal: string | null
          current_streak: number
          longest_streak: number
          streak_freezes_available: number
          total_xp: number
          level: number
          last_streak_date?: string | null
          created_at: string
        }
        Insert: {
          id?: string
          email: string
          name?: string | null
          auth_provider?: string
          timezone?: string
          goal?: string | null
          current_streak?: number
          longest_streak?: number
          streak_freezes_available?: number
          last_streak_date?: string | null
          total_xp?: number
          level?: number
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['users']['Insert']>
      }
      user_lesson_progress: {
        Row: {
          user_id: string
          lesson_id: string  // stable les_XXXXXX ID (was lesson_slug pre-migration)
          status: 'not_started' | 'in_progress' | 'completed'
          theory_read_at: string | null
          quiz_score: number | null
          quiz_attempts: number
          xp_earned: number
          completed_at: string | null
        }
        Insert: {
          user_id: string
          lesson_id: string
          status?: 'not_started' | 'in_progress' | 'completed'
          theory_read_at?: string | null
          quiz_score?: number | null
          quiz_attempts?: number
          xp_earned?: number
          completed_at?: string | null
        }
        Update: Partial<Database['public']['Tables']['user_lesson_progress']['Insert']>
      }
      quiz_attempts: {
        Row: {
          id: string
          user_id: string
          lesson_id: string  // stable les_XXXXXX ID (was lesson_slug pre-migration)
          question_id: string
          selected_option: number
          is_correct: boolean
          attempted_at: string
        }
        Insert: {
          id?: string
          user_id: string
          lesson_id: string
          question_id: string
          selected_option: number
          is_correct: boolean
          attempted_at?: string
        }
        Update: Partial<Database['public']['Tables']['quiz_attempts']['Insert']>
      }
      user_flashcard_srs: {
        Row: {
          user_id: string
          lesson_id: string  // part of composite PK: (user_id, lesson_id, flashcard_id)
          flashcard_id: string
          ease_factor: number
          interval_days: number
          repetitions: number
          next_review_at: string
        }
        Insert: {
          user_id: string
          lesson_id: string
          flashcard_id: string
          ease_factor?: number
          interval_days?: number
          repetitions?: number
          next_review_at?: string
        }
        Update: Partial<Database['public']['Tables']['user_flashcard_srs']['Insert']>
      }
      xp_events: {
        Row: {
          id: string
          user_id: string
          source_type: string
          source_id: string | null
          xp_amount: number
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          source_type: string
          source_id?: string | null
          xp_amount: number
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['xp_events']['Insert']>
      }
      reflections: {
        Row: {
          id: string
          user_id: string
          lesson_id: string  // stable les_XXXXXX ID (was lesson_slug pre-migration)
          content: string
          is_public: boolean
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          lesson_id: string
          content: string
          is_public?: boolean
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['reflections']['Insert']>
      }
      bookmarks: {
        Row: {
          id: string
          user_id: string
          lesson_id: string  // stable les_XXXXXX ID (was lesson_slug pre-migration)
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          lesson_id: string
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['bookmarks']['Insert']>
      }
      capstone_submissions: {
        Row: {
          id: string
          user_id: string
          module_slug: string
          content: string
          status: string
          is_public: boolean
          submitted_at: string
        }
        Insert: {
          id?: string
          user_id: string
          module_slug: string
          content: string
          status?: string
          is_public?: boolean
          submitted_at?: string
        }
        Update: Partial<Database['public']['Tables']['capstone_submissions']['Insert']>
      }
      badges: {
        Row: {
          id: string
          key: string
          name: string
          description: string
          icon: string
        }
        Insert: {
          id?: string
          key: string
          name: string
          description: string
          icon: string
        }
        Update: Partial<Database['public']['Tables']['badges']['Insert']>
      }
      user_badges: {
        Row: {
          user_id: string
          badge_id: string
          earned_at: string
        }
        Insert: {
          user_id: string
          badge_id: string
          earned_at?: string
        }
        Update: Partial<Database['public']['Tables']['user_badges']['Insert']>
      }
      waitlist: {
        Row: {
          id: string
          name: string
          email: string
          career_position: string
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
          career_position: string
          source?: string
          utm_source?: string | null
          utm_medium?: string | null
          utm_campaign?: string | null
          referrer?: string | null
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['waitlist']['Insert']>
      }
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}

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

