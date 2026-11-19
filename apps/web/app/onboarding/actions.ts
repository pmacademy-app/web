'use server'

import { cookies, headers } from 'next/headers'
import { after } from 'next/server'
import { z } from 'zod'
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
import { isValidAvatarUrl } from '@/lib/avatar/avatar-service'
import { validateUsername } from '@/lib/portfolio'
import { trackProductEvent } from '@/lib/events/product-events'
import { profileUpdateSchema } from '@/lib/api/contracts/settings'
import {
  DEFAULT_EXPERIENCE_OPTIONS,
  DEFAULT_GOAL_OPTIONS,
  DEFAULT_PREFERENCE_OPTIONS,
  DEFAULT_TOPIC_OPTIONS,
} from '@/lib/onboarding/onboarding-defaults'
import type { OnboardingFieldOption } from '@/lib/settings/types'
import { revalidatePublicPortfolio } from '@/lib/portfolio-revalidate'
import { evaluatePersistentRateLimit } from '@/lib/rate-limit'
import { getClientIpBucket } from '@/lib/security/client-ip'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export interface OnboardingData {
  // Phase 4 (Collapse the Entrance): the critical onboarding path is now goal + experience.
  // Identity/portfolio fields below are DEFERRED — optional at onboarding and collected later
  // in Settings → Portfolio, which validates them identically (lib/portfolio.ts:validateUsername).
  // They remain in the payload for backward compatibility with any client that still sends them.
  goal: string // Primary goal — REQUIRED (drives completion + the recommended starting module)
  career_role: string // Experience level / Role — REQUIRED
  weekly_goal_lessons?: number | null
  session_minutes?: number | null
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

/** Option ids are short slugs (defaults and admin-configured options alike). */
const optionId = z
  .string()
  .trim()
  .max(64, 'That option is not recognized.')
  .regex(/^[a-z0-9][a-z0-9_-]*$/i, 'That option is not recognized.')

/**
 * Server-side shape of the onboarding payload (M2). The identity fields reuse the Settings
 * profile schema, so the limits and the https-only URL rule (validateWritableUrl) are the
 * ones Settings > Portfolio applies. Membership of goal, experience, preference and topics
 * in the configured option lists is checked after parsing (see allowedOptionIds).
 */
const onboardingSchema = profileUpdateSchema.extend({
  goal: z.string().trim().min(1, 'Please choose your primary learning goal.').pipe(optionId),
  career_role: z.string().trim().min(1, 'Please choose your experience level.').pipe(optionId),
  weekly_goal_lessons: z.number().nullable().optional(),
  session_minutes: z.number().nullable().optional(),
  username: z.string().max(64, 'Invalid username.').optional().nullable(),
  topics: z.array(optionId).max(20, 'Choose at most 20 topics.').optional().nullable(),
  learning_preference: z.union([z.literal(''), optionId]).optional().nullable(),
  twitter_url: z.string().max(200, 'Twitter handle must be 200 characters or fewer.').optional().nullable(),
})

type ParsedOnboarding = z.infer<typeof onboardingSchema>

function enabledIds(options: OnboardingFieldOption[] | undefined): string[] {
  return (options ?? []).filter((option) => option.enabled !== false).map((option) => option.id)
}

/**
 * The option ids a learner may submit: the defaults plus whatever the admin configured.
 * Null when the settings cannot be read, in which case only the slug format is enforced
 * so an outage never blocks an admin-configured option.
 */
async function allowedOptionIds(): Promise<{
  goal: Set<string>
  experience: Set<string>
  preference: Set<string>
  topic: Set<string>
} | null> {
  try {
    const { SettingsService } = await import('@/lib/settings/system-settings-service')
    const settings = await SettingsService.getOnboardingSettings()
    const options = settings?.fieldOptions ?? {}
    return {
      goal: new Set([...enabledIds(DEFAULT_GOAL_OPTIONS), ...enabledIds(options.goal)]),
      experience: new Set([...enabledIds(DEFAULT_EXPERIENCE_OPTIONS), ...enabledIds(options.experience_level)]),
      preference: new Set([...enabledIds(DEFAULT_PREFERENCE_OPTIONS), ...enabledIds(options.learning_preference)]),
      topic: new Set([...enabledIds(DEFAULT_TOPIC_OPTIONS), ...enabledIds(options.topics)]),
    }
  } catch (err) {
    console.warn('[onboarding/actions] Onboarding options unavailable, checking format only:', err)
    return null
  }
}

/** The first refusal message for a payload whose option ids are not configured, or null. */
async function optionRefusal(data: ParsedOnboarding): Promise<string | null> {
  const allowed = await allowedOptionIds()
  if (!allowed) return null
  if (!allowed.goal.has(data.goal)) return 'Please choose your primary learning goal.'
  if (!allowed.experience.has(data.career_role)) return 'Please choose your experience level.'
  if (data.learning_preference && !allowed.preference.has(data.learning_preference)) {
    return 'That learning preference is not recognized.'
  }
  if (data.topics?.some((topic) => !allowed.topic.has(topic))) return 'One of the selected topics is not recognized.'
  return null
}

/** Username checks per IP per minute: generous for typing, useless for enumerating handles. */
const USERNAME_CHECK_LIMIT = { windowMs: 60 * 1000, limit: 30 }

export async function checkUsernameAvailability(rawUsername: string, currentUserId?: string): Promise<{ available: boolean; error?: string }> {
  try {
    // M2: an unauthenticated caller can probe handles here, so it is limited per IP.
    const ipBucket = getClientIpBucket({ headers: await headers() })
    const limit = await evaluatePersistentRateLimit(`username_check_ip:${ipBucket}`, USERNAME_CHECK_LIMIT)
    if (!limit.success) {
      return { available: false, error: 'Too many username checks. Please wait a minute and try again.' }
    }

    // CQ-24: the same rule as Settings > Portfolio (lib/portfolio.ts), reserved words included.
    // Handles are stored lowercase by both writers.
    const username = (typeof rawUsername === 'string' ? rawUsername : '').trim().toLowerCase()
    const check = validateUsername(username)
    if (!check.isValid) {
      return { available: false, error: check.reason ?? 'Invalid username.' }
    }

    const dbSupabase = createServiceRoleClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let query = (dbSupabase.from('users') as any).select('id').eq('username', username)
    if (currentUserId) {
      query = query.neq('id', currentUserId)
    }

    const { data, error } = await query.maybeSingle()
    if (error) {
      // CQ-24: fail closed. Reporting "available" on an error let a taken handle through to the
      // submit, where the unique index then rejected it.
      console.error('[checkUsernameAvailability] DB query error:', error.message)
      return { available: false, error: CHECK_UNAVAILABLE_ERROR }
    }

    if (data) {
      return { available: false, error: 'This username is already taken. Please choose another.' }
    }

    return { available: true }
  } catch (err) {
    console.error('[checkUsernameAvailability] Exception:', err)
    return { available: false, error: CHECK_UNAVAILABLE_ERROR }
  }
}

const CHECK_UNAVAILABLE_ERROR = 'Could not check this username right now. Please try again.'

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

/**
 * Runs `task` once the response has been sent, via after(). If after() cannot schedule it
 * (called outside a request scope, as in a unit test that does not stub it), the task is
 * awaited inline instead, so the event is still recorded. Only for tasks that never throw.
 */
async function recordAfterResponse(task: () => Promise<unknown>): Promise<void> {
  try {
    after(task)
  } catch {
    await task()
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

    // Server-side validation. Phase 4 (Collapse the Entrance): goal + experience are the
    // only required inputs; they are what `app/(app)/layout.tsx` and `proxy.ts` read as the
    // onboarding-completion signal. M2: the whole payload goes through one zod schema first,
    // so lengths, URL schemes and option ids are enforced here, not only in the client.
    const parsed = onboardingSchema.safeParse(data ?? {})
    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? 'Please check your answers and try again.' }
    }
    const input = parsed.data
    const refusal = await optionRefusal(input)
    if (refusal) {
      return { error: refusal }
    }

    const goal = input.goal
    const careerRole = input.career_role
    const topics = input.topics && input.topics.length > 0 ? input.topics : undefined
    const learningPreference = input.learning_preference?.trim() || undefined

    const dbSupabase = createServiceRoleClient()

    // M2: once onboarding is complete, the public identity (handle, name, avatar, bio,
    // links) belongs to Settings > Portfolio, which purges the cached portfolio and applies
    // its own checks. A replayed or scripted onboarding submit therefore cannot rewrite it;
    // those fields are ignored and only the learning-path fields are saved.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: existingProfile } = await (dbSupabase.from('users') as any)
      .select('onboarding_completed, username')
      .eq('id', userId)
      .maybeSingle()
    const identityLocked = existingProfile?.onboarding_completed === true
    const previousUsername: string | null =
      typeof existingProfile?.username === 'string' ? existingProfile.username : null

    // Deferred identity fields. Optional at onboarding, but a supplied value must be
    // well-formed. CQ-24: validateUsername (lib/portfolio.ts) is the rule Settings >
    // Portfolio uses, so a reserved handle such as `admin` is refused here too. Stored
    // lowercase, like Settings.
    const username = identityLocked ? '' : (input.username || '').trim().toLowerCase()
    if (username) {
      const usernameCheck = validateUsername(username)
      if (!usernameCheck.isValid) {
        return { error: usernameCheck.reason ?? 'Invalid username.' }
      }
    }

    const name = identityLocked ? '' : (input.name || '').trim()
    const avatarUrl = identityLocked ? '' : (input.avatar_url || '').trim()

    // Assemble learning purpose composite
    const topicsStr = topics ? topics.join(', ') : ''
    const prefStr = learningPreference ? `Preference: ${learningPreference}` : ''
    const compositeLearningPurpose = [
      topicsStr ? `Interests: ${topicsStr}` : '',
      prefStr,
    ].filter(Boolean).join(' | ') || null

    // Normalize website / portfolio / social URL (only relevant when a value is supplied).
    // The website went through validateWritableUrl in the schema; the X handle is reduced to
    // a bare handle and rebuilt on https://x.com, so neither can carry another scheme.
    const twitterHandle = (input.twitter_url || '')
      .trim()
      .replace(/^@/, '')
      .replace(/^https?:\/\/(www\.)?(twitter|x)\.com\//, '')
    const websiteUrl =
      input.website_url?.trim() ||
      (twitterHandle && /^[A-Za-z0-9_]{1,15}$/.test(twitterHandle) ? `https://x.com/${twitterHandle}` : null)

    // 1. Update public.users with the required fields, plus any deferred field the caller supplied.
    //
    // The required path always writes goal, experience and the completion flag. Deferred identity
    // fields are added to the update ONLY when a non-empty value is present, so:
    //   - a new one-screen learner leaves username/name/avatar/bio/socials untouched (they stay
    //     NULL and are collected later in Settings > Portfolio), and
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
    if (avatarUrl) {
      if (!isValidAvatarUrl(avatarUrl)) {
        return { success: false, error: "Avatar URL must be hosted on Prodily's secure avatar storage." }
      }
      updatePayload.avatar_url = avatarUrl
    }
    if (!identityLocked) {
      if (input.bio?.trim()) updatePayload.bio = input.bio.trim()
      if (input.linkedin_url?.trim()) updatePayload.linkedin_url = input.linkedin_url.trim()
      if (input.github_url?.trim()) updatePayload.github_url = input.github_url.trim()
      if (websiteUrl) updatePayload.website_url = websiteUrl
    }
    if (compositeLearningPurpose) updatePayload.learning_purpose = compositeLearningPurpose
    if (topics) updatePayload.onboarding_topics = topics
    if (learningPreference) updatePayload.onboarding_preference = learningPreference
    if (typeof input.weekly_goal_lessons === 'number' && input.weekly_goal_lessons >= 1 && input.weekly_goal_lessons <= 7) {
      updatePayload.weekly_goal_lessons = input.weekly_goal_lessons
    }
    if (typeof input.session_minutes === 'number' && [10, 15, 20, 30, 45, 60].includes(input.session_minutes)) {
      updatePayload.session_minutes = input.session_minutes
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: dbError } = await (dbSupabase.from('users') as any).update(updatePayload).eq('id', userId)

    if (dbError) {
      console.error('[onboarding/actions] Database update error:', dbError.message)
      if (dbError.message.includes('unique constraint') || dbError.code === '23505') {
        return { error: 'Username is already taken. Please choose another.' }
      }
      return { error: 'Failed to save profile information. Please try again.' }
    }

    // A handle change moves the public portfolio: purge the cached pages under the old
    // handle (they must stop resolving) and the new one (a cached "unavailable" render).
    if (username && username !== previousUsername) {
      revalidatePublicPortfolio(previousUsername)
      revalidatePublicPortfolio(username)
    }

    // 2. Update auth metadata so middleware and the JWT reflect onboarding_complete in app_metadata
    //    and the chosen path in user_metadata. Only the required fields are always written; deferred
    //    identity fields are included only when supplied, mirroring the DB update above.
    const { error: metaError } = await dbSupabase.auth.admin.updateUserById(userId, {
      app_metadata: {
        onboarding_complete: true,
      },
      user_metadata: {
        ...(name ? { full_name: name } : {}),
        ...(username ? { username } : {}),
        ...(avatarUrl ? { avatar_url: avatarUrl } : {}),
        career_role: careerRole,
        goal,
        ...(topics ? { topics } : {}),
        ...(learningPreference ? { learning_preference: learningPreference } : {}),
        onboarding_complete: true,
      },
    })

    if (metaError) {
      console.error('[onboarding/actions] Metadata update error:', metaError.message)
    }

    // PROD-15: the profile write above succeeded, so onboarding is complete. Recorded after the
    // response; trackProductEvent never throws.
    await recordAfterResponse(() =>
      trackProductEvent('onboarding_completed', userId, {
        goal,
        career_role: careerRole,
        username_set: Boolean(username),
      })
    )

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
      topics
    )

    return { success: true, recommendedLessonPath }
  } catch (err) {
    console.error('[onboarding/actions] Unexpected error:', err)
    return { error: 'An unexpected error occurred. Please try again.' }
  }
}
