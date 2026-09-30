'use server'

import { cookies } from 'next/headers'
import { createClient } from '@supabase/supabase-js'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createServiceRoleClient, type Database } from '@/lib/supabase'
import { fetchCurriculumData } from '@/lib/lesson-loader'
import {
  resolvePersonalizedPath,
  resolveStartLearningTarget,
  academyLessonPath,
} from '@/lib/personalization/path-resolver'
import { isModuleEntryUnlockTreatment } from '@/lib/academy/module-entry-unlock'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export interface OnboardingData {
  // Phase 4 (Collapse the Entrance): the critical onboarding path is now goal + experience.
  // Identity/portfolio fields below are DEFERRED — optional at onboarding and collected later
  // in Settings → Portfolio, which validates them identically (lib/portfolio.ts:validateUsername).
  // They remain in the payload for backward compatibility with any client that still sends them.
  goal: string // Primary goal — REQUIRED (drives completion + the recommended starting module)
  career_role: string // Experience level / Role — REQUIRED
  name?: string // Deferred: display name
  username?: string // Deferred: public portfolio handle
  avatar_url?: string | null // Deferred
  bio?: string // Deferred
  topics?: string[] // Deferred: multiple selected interests
  learning_preference?: string // Deferred: preferred learning style
  linkedin_url?: string // Deferred
  twitter_url?: string // Deferred
  github_url?: string // Deferred
  website_url?: string // Deferred
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

/**
 * Phase 2 — record the furthest onboarding-wizard step a learner reached.
 *
 * IMPLEMENTATION_PLAN.md §"Phase 2" item 3: the wizard is a client component whose
 * intermediate steps leave no server trace, so per-step drop-off cannot be measured.
 * This writes a lightweight, monotonic marker (`users.onboarding_step_reached`) that the
 * admin activation funnel reads.
 *
 * Deliberately best-effort: it never blocks the wizard and swallows its own errors. A
 * failed marker write costs one data point, never the learner's onboarding. The write is
 * monotonic — it only ever advances the recorded step — so out-of-order calls (e.g. a
 * learner clicking Back then Forward) cannot regress the furthest step reached.
 */
export async function recordOnboardingStep(step: number): Promise<void> {
  try {
    if (!Number.isInteger(step) || step < 1 || step > 4) return

    const cookieStore = await cookies()
    const accessToken = cookieStore.get('sb-access-token')?.value
    if (!accessToken) return

    const authSupabase = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: false },
    })
    const {
      data: { user },
      error: authError,
    } = await authSupabase.auth.getUser(accessToken)
    if (authError || !user?.id) return

    const dbSupabase = createServiceRoleClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: existing } = await (dbSupabase.from('users') as any)
      .select('onboarding_step_reached')
      .eq('id', user.id)
      .maybeSingle()

    const current: number | null = existing?.onboarding_step_reached ?? null
    if (current !== null && current >= step) return // monotonic: never regress

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (dbSupabase.from('users') as any)
      .update({ onboarding_step_reached: step })
      .eq('id', user.id)
  } catch (err) {
    console.error('[onboarding/actions] recordOnboardingStep failed (non-blocking):', err)
  }
}

/**
 * Phase 6 — resolves the Academy path "Start Learning" should open, from the learner's saved
 * onboarding fields. Derives the recommendation (no persisted column) and honours the
 * module-entry unlock model + grandfathering, so under treatment it lands on the recommended
 * module's unlocked entry lesson and otherwise falls back safely to the first actionable
 * lesson. Best-effort: any failure returns null and the caller uses a static fallback.
 */
async function resolveRecommendedLessonPath(
  supabase: SupabaseClient<Database>,
  userId: string,
  goal: string,
  careerRole: string,
  topics: string[] | undefined
): Promise<string | null> {
  try {
    const curriculum = await fetchCurriculumData()
    if (!curriculum?.lessons?.length) return null

    const [{ data: userRow }, { data: progressRows }] = await Promise.all([
      supabase.from('users').select('created_at, curriculum_access_override').eq('id', userId).maybeSingle(),
      supabase.from('user_lesson_progress').select('lesson_id, status').eq('user_id', userId),
    ])

    const treatment = isModuleEntryUnlockTreatment({
      id: userId,
      createdAt: (userRow as { created_at?: string } | null)?.created_at,
    })

    const completedIds = new Set<string>()
    const openedIds = new Set<string>()
    for (const r of (progressRows ?? []) as { lesson_id: string; status: string }[]) {
      openedIds.add(r.lesson_id)
      if (r.status === 'completed') completedIds.add(r.lesson_id)
    }

    const path = resolvePersonalizedPath({
      goal,
      career_role: careerRole,
      onboarding_topics: topics ?? null,
    })

    const target = resolveStartLearningTarget(path, curriculum.lessons, {
      completedIds,
      openedIds,
      treatment,
      override: Boolean((userRow as { curriculum_access_override?: boolean } | null)?.curriculum_access_override),
    })

    return target ? academyLessonPath(target.lesson) : null
  } catch (err) {
    console.error('[onboarding/actions] resolveRecommendedLessonPath failed (non-blocking):', err)
    return null
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

    // Server-side validation — Phase 4 (Collapse the Entrance).
    //
    // The critical onboarding path is goal + experience only. These two are what make the
    // learner's path meaningful and, via `profile.goal`, what `app/(app)/layout.tsx` and
    // `proxy.ts` read as the onboarding-completion signal. They are the sole required inputs.
    const goal = (data.goal || '').trim()
    if (!goal) {
      return { error: 'Please choose your primary learning goal.' }
    }

    const careerRole = (data.career_role || '').trim()
    if (!careerRole) {
      return { error: 'Please choose your experience level.' }
    }

    // Deferred identity fields. Optional at onboarding — but if a value IS supplied (e.g. by an
    // older client, or a resuming user's prefilled draft) it must still be well-formed, matching
    // the client and the later Settings → Portfolio validation. An absent value is written as NULL
    // and collected later; a malformed one is rejected rather than silently persisted.
    const username = (data.username || '').trim().toLowerCase()
    if (username && (username.length < 3 || username.length > 24 || !/^[a-z0-9_]+$/.test(username))) {
      return { error: 'Username must be 3–24 characters and only contain letters, numbers, and underscores.' }
    }

    const name = (data.name || '').trim()

    const dbSupabase = createServiceRoleClient()

    // Assemble learning purpose composite
    const topicsStr = Array.isArray(data.topics) && data.topics.length > 0 ? data.topics.join(', ') : ''
    const prefStr = data.learning_preference ? `Preference: ${data.learning_preference}` : ''
    const compositeLearningPurpose = [
      topicsStr ? `Interests: ${topicsStr}` : '',
      prefStr,
    ].filter(Boolean).join(' | ') || null

    // Normalize website / portfolio / social URL (only relevant when a value is supplied).
    const websiteUrl = data.website_url?.trim() || (data.twitter_url ? `https://x.com/${data.twitter_url.replace(/^@/, '').replace(/^https?:\/\/(www\.)?(twitter|x)\.com\//, '')}` : null)

    // 1. Update public.users with the required fields, plus any deferred field the caller supplied.
    //
    // The required path always writes goal, experience and the completion flag. Deferred identity
    // fields are added to the update ONLY when a non-empty value is present, so:
    //   - a new one-screen learner leaves username/name/avatar/bio/socials untouched (they stay
    //     NULL and are collected later in Settings → Portfolio), and
    //   - a resuming learner (or an older client sending the full form) never has existing profile
    //     data overwritten with nulls.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updatePayload: Record<string, any> = {
      career_role: careerRole,
      goal,
      onboarding_completed: true,
    }
    if (name) updatePayload.name = name
    if (username) updatePayload.username = username
    if (data.avatar_url?.trim()) updatePayload.avatar_url = data.avatar_url.trim()
    if (data.bio?.trim()) updatePayload.bio = data.bio.trim()
    if (compositeLearningPurpose) updatePayload.learning_purpose = compositeLearningPurpose
    if (Array.isArray(data.topics) && data.topics.length > 0) updatePayload.onboarding_topics = data.topics
    if (data.learning_preference?.trim()) updatePayload.onboarding_preference = data.learning_preference.trim()
    if (data.linkedin_url?.trim()) updatePayload.linkedin_url = data.linkedin_url.trim()
    if (data.github_url?.trim()) updatePayload.github_url = data.github_url.trim()
    if (websiteUrl) updatePayload.website_url = websiteUrl

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: dbError } = await (dbSupabase.from('users') as any).update(updatePayload).eq('id', userId)

    if (dbError) {
      console.error('[onboarding/actions] Database update error:', dbError.message)
      if (dbError.message.includes('unique constraint') || dbError.code === '23505') {
        return { error: 'Username is already taken. Please choose another.' }
      }
      return { error: 'Failed to save profile information. Please try again.' }
    }

    // 2. Update auth metadata so middleware and the JWT reflect onboarding_complete and the
    //    chosen path. Only the required fields are always written; deferred identity fields are
    //    included only when supplied, mirroring the DB update above.
    const { error: metaError } = await dbSupabase.auth.admin.updateUserById(userId, {
      user_metadata: {
        ...(name ? { full_name: name } : {}),
        ...(username ? { username } : {}),
        ...(data.avatar_url ? { avatar_url: data.avatar_url } : {}),
        career_role: careerRole,
        goal,
        ...(Array.isArray(data.topics) && data.topics.length > 0 ? { topics: data.topics } : {}),
        ...(data.learning_preference ? { learning_preference: data.learning_preference } : {}),
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

    // Phase 6: resolve where "Start Learning" should land the learner. Computed after the
    // profile write so it reads the just-saved goal/experience. Best-effort — a null path
    // makes the client fall back to its static primary destination.
    const recommendedLessonPath = await resolveRecommendedLessonPath(
      dbSupabase,
      userId,
      goal,
      careerRole,
      data.topics
    )

    return { success: true, recommendedLessonPath }
  } catch (err) {
    console.error('[onboarding/actions] Unexpected error:', err)
    return { error: 'An unexpected error occurred. Please try again.' }
  }
}
