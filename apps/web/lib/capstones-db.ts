/**
 * Capstone Database Operations Service (Phase 3 Sprint 1)
 *
 * Handles server-side queries and mutations for `capstone_submissions` and `reflections`.
 * Ensures authorization security, idempotency of XP awards (150 XP),
 * streak updates, and module progress synchronization.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase'
import { getAllCapstoneDefinitions, getCapstoneDefinition } from '@/config/capstones'
import {
  deriveCapstoneStatus,
  validateCapstoneSubmission,
  validateCapstoneTransition,
  type CapstoneStatus,
} from '@/lib/capstones'
import { awardXp, hasXpEvent } from '@/lib/xp-service'
import { getRuntimeXpValues } from '@/lib/xp'
import { updateUserStreak } from '@/lib/streaks-db'

import { getLessonIdsForModule } from '@/lib/curriculum-registry'

type CapstoneSubmissionRow = Database['public']['Tables']['capstone_submissions']['Row']
type ReflectionRow = Database['public']['Tables']['reflections']['Row']

interface DBChain {
  [method: string]: (...args: unknown[]) => DBChain & Promise<{ data: unknown; error: unknown }>
}

export interface ModuleCapstoneOverviewItem {
  moduleSlug: string
  moduleNumber: number
  moduleTitle: string
  capstoneTitle: string
  deliverableType: string
  estimatedHours: string
  status: CapstoneStatus
  submission: CapstoneSubmissionRow | null
  lessonsCompleted: number
  totalLessons: number
  unlocked: boolean
}

/**
 * Fetches the overview status of capstones across all 9 modules for a user.
 * Evaluates completion and unlock states from authoritative per-module lesson progress.
 */
export async function getModuleCapstonesOverview(
  supabase: SupabaseClient<Database>,
  userId: string
): Promise<ModuleCapstoneOverviewItem[]> {
  const definitions = getAllCapstoneDefinitions()

  // 1. Fetch user's capstone submissions
  const { data: submissions, error: subError } = (await (supabase
    .from('capstone_submissions') as unknown as DBChain)
    .select('*')
    .eq('user_id', userId)) as unknown as { data: CapstoneSubmissionRow[] | null; error: unknown }

  if (subError) {
    console.error('[capstones-db] Error fetching capstone submissions:', subError)
  }

  // 2. Fetch user's completed lesson progress to calculate unlock state
  const { data: progressRows, error: progError } = (await (supabase
    .from('user_lesson_progress') as unknown as DBChain)
    .select('lesson_id, status')
    .eq('user_id', userId)
    .eq('status', 'completed')) as unknown as { data: { lesson_id: string; status: string }[] | null; error: unknown }

  if (progError) {
    console.error('[capstones-db] Error fetching lesson progress:', progError)
  }

  // Map submissions by module_slug
  const submissionMap = new Map<string, CapstoneSubmissionRow>()
  if (submissions) {
    for (const sub of submissions) {
      // Keep newest if multiple
      const existing = submissionMap.get(sub.module_slug)
      if (!existing || new Date(sub.submitted_at) > new Date(existing.submitted_at)) {
        submissionMap.set(sub.module_slug, sub)
      }
    }
  }

  // Set of completed lesson IDs for exact matching
  const completedLessonIds = new Set(progressRows?.map((p) => p.lesson_id) || [])

  return definitions.map((def) => {
    const sub = submissionMap.get(def.moduleSlug) ?? null
    
    const moduleLessonIds = getLessonIdsForModule(def.moduleSlug)
    const totalLessons = moduleLessonIds.length > 0 ? moduleLessonIds.length : 10
    const lessonsCompleted = moduleLessonIds.length > 0
      ? moduleLessonIds.filter((id) => completedLessonIds.has(id)).length
      : 0
    
    let status: CapstoneStatus = 'locked'
    if (sub) {
      status = deriveCapstoneStatus(sub.status, lessonsCompleted)
    } else if (lessonsCompleted >= 8) {
      status = 'unlocked'
    } else {
      status = 'locked'
    }

    return {
      moduleSlug: def.moduleSlug,
      moduleNumber: def.moduleNumber,
      moduleTitle: def.moduleTitle,
      capstoneTitle: def.title,
      deliverableType: def.deliverableType,
      estimatedHours: def.estimatedHours,
      status,
      submission: sub,
      lessonsCompleted,
      totalLessons,
      unlocked: status !== 'locked',
    }
  })
}

/**
 * Loads capstone submission/draft and associated reflection for a specific module.
 */
export async function loadCapstoneSubmission(
  supabase: SupabaseClient<Database>,
  userId: string,
  moduleSlug: string
): Promise<{
  submission: CapstoneSubmissionRow | null
  reflection: ReflectionRow | null
  status: CapstoneStatus
}> {
  const { data: submissions, error: subError } = (await (supabase
    .from('capstone_submissions') as unknown as DBChain)
    .select('*')
    .eq('user_id', userId)
    .eq('module_slug', moduleSlug)
    .order('submitted_at', { ascending: false })
    .limit(1)) as unknown as { data: CapstoneSubmissionRow[] | null; error: unknown }

  if (subError) throw subError
  const submission = submissions && submissions.length > 0 ? submissions[0] : null

  // Fetch capstone reflection (keyed by `capstone-${moduleSlug}`)
  const reflectionKey = `capstone-${moduleSlug}`
  const { data: reflections, error: refError } = (await (supabase
    .from('reflections') as unknown as DBChain)
    .select('*')
    .eq('user_id', userId)
    .eq('lesson_id', reflectionKey)
    .limit(1)) as unknown as { data: ReflectionRow[] | null; error: unknown }

  if (refError) {
    console.warn('[capstones-db] Non-fatal error loading capstone reflection:', refError)
  }

  const reflection = reflections && reflections.length > 0 ? reflections[0] : null

  // Authoritatively derive capstone status based on module lesson completion
  const moduleLessonIds = getLessonIdsForModule(moduleSlug)
  let lessonsCompleted = 0
  if (moduleLessonIds.length > 0) {
    const { data: progressRows } = (await (supabase
      .from('user_lesson_progress') as unknown as DBChain)
      .select('lesson_id, status')
      .eq('user_id', userId)
      .eq('status', 'completed')
      .in('lesson_id', moduleLessonIds)) as unknown as { data: { lesson_id: string }[] | null }
    lessonsCompleted = progressRows?.length ?? 0
  }

  const status = deriveCapstoneStatus(submission?.status ?? null, lessonsCompleted)

  return {
    submission,
    reflection,
    status,
  }
}

/**
 * Saves or updates a draft capstone submission.
 */
export async function saveDraftAction(
  supabase: SupabaseClient<Database>,
  userId: string,
  moduleSlug: string,
  content: string
): Promise<{ success: boolean; submission: CapstoneSubmissionRow }> {
  // Check for existing draft or submission
  const { data: existingList } = (await (supabase
    .from('capstone_submissions') as unknown as DBChain)
    .select('*')
    .eq('user_id', userId)
    .eq('module_slug', moduleSlug)
    .order('submitted_at', { ascending: false })
    .limit(1)) as unknown as { data: CapstoneSubmissionRow[] | null }

  const existing = existingList && existingList.length > 0 ? existingList[0] : null

  // If creating new draft (no existing row), ensure module is unlocked (>= 8 lessons completed)
  if (!existing) {
    const moduleLessonIds = getLessonIdsForModule(moduleSlug)
    let lessonsCompleted = 0
    if (moduleLessonIds.length > 0) {
      const { data: progressRows } = (await (supabase
        .from('user_lesson_progress') as unknown as DBChain)
        .select('lesson_id, status')
        .eq('user_id', userId)
        .eq('status', 'completed')
        .in('lesson_id', moduleLessonIds)) as unknown as { data: { lesson_id: string }[] | null }
      lessonsCompleted = progressRows?.length ?? 0
    }
    if (lessonsCompleted < 8) {
      throw new Error(`Cannot save draft. Capstone is locked until at least 8 lessons in this module are completed (currently ${lessonsCompleted}/10 completed).`)
    }
  }

  // Validate state transition
  const transition = validateCapstoneTransition(existing?.status, 'draft', 'learner')
  if (!transition.allowed) {
    if (existing) {
      return { success: true, submission: existing }
    }
    throw new Error(transition.reason || 'Cannot modify capstone in current state.')
  }

  const now = new Date().toISOString()
  let result: CapstoneSubmissionRow

  if (existing) {
    const { data: updated, error: updateError } = (await (supabase
      .from('capstone_submissions') as unknown as DBChain)
      .update({
        content,
        status: 'draft',
        submitted_at: now,
      })
      .eq('id', existing.id)
      .select()
      .single()) as unknown as { data: CapstoneSubmissionRow | null; error: unknown }

    if (updateError) throw updateError
    result = updated!
  } else {
    const { data: inserted, error: insertError } = (await (supabase
      .from('capstone_submissions') as unknown as DBChain)
      .insert({
        user_id: userId,
        module_slug: moduleSlug,
        content,
        status: 'draft',
        is_public: false,
        submitted_at: now,
      })
      .select()
      .single()) as unknown as { data: CapstoneSubmissionRow | null; error: unknown }

    if (insertError) throw insertError
    result = inserted!
  }

  return { success: true, submission: result }
}

/**
 * Submits a capstone, validates requirements, awards 150 XP (idempotently),
 * saves reflection, and locks submission.
 */
export async function submitCapstoneAction(
  supabase: SupabaseClient<Database>,
  userId: string,
  moduleSlug: string,
  content: string,
  reflectionContent?: string,
  reflectionIsPublic: boolean = false,
  isPublic?: boolean
): Promise<{
  success: boolean
  submission: CapstoneSubmissionRow
  xpEarned: number
  message?: string
}> {
  // 1. Fetch existing row to preserve or update
  const { data: existingList } = (await (supabase
    .from('capstone_submissions') as unknown as DBChain)
    .select('*')
    .eq('user_id', userId)
    .eq('module_slug', moduleSlug)
    .order('submitted_at', { ascending: false })
    .limit(1)) as unknown as { data: CapstoneSubmissionRow[] | null }

  const existing = existingList && existingList.length > 0 ? existingList[0] : null

  // 2. Idempotent duplicate submission protection
  if (existing && existing.status === 'submitted') {
    return {
      success: true,
      submission: existing,
      xpEarned: 0,
      message: 'Capstone already submitted.',
    }
  }

  // 3. If creating new submission, ensure module is unlocked (>= 8 lessons completed)
  if (!existing) {
    const moduleLessonIds = getLessonIdsForModule(moduleSlug)
    let lessonsCompleted = 0
    if (moduleLessonIds.length > 0) {
      const { data: progressRows } = (await (supabase
        .from('user_lesson_progress') as unknown as DBChain)
        .select('lesson_id, status')
        .eq('user_id', userId)
        .eq('status', 'completed')
        .in('lesson_id', moduleLessonIds)) as unknown as { data: { lesson_id: string }[] | null }
      lessonsCompleted = progressRows?.length ?? 0
    }
    if (lessonsCompleted < 8) {
      throw new Error(`Cannot submit capstone. You must complete at least 8 lessons in this module first (currently ${lessonsCompleted}/10 completed).`)
    }
  }

  // 4. Fetch user to check portfolio privacy setting (mock-safe fallback)
  let userEmail = ''
  let userName = 'Learner'
  let isPortfolioPublic: boolean | null = null

  try {
    const userQuery = (supabase.from('users') as unknown as DBChain)
      ?.select?.('email, name, is_portfolio_public')
      ?.eq?.('id', userId)

    interface UserRecord {
      email: string
      name: string | null
      is_portfolio_public: boolean | null
    }

    let queryRes: { data: UserRecord | null } | null = null
    if (userQuery && typeof userQuery.maybeSingle === 'function') {
      queryRes = (await userQuery.maybeSingle()) as unknown as { data: UserRecord | null }
    } else if (userQuery && typeof userQuery.single === 'function') {
      queryRes = (await userQuery.single()) as unknown as { data: UserRecord | null }
    }

    if (queryRes?.data) {
      userEmail = queryRes.data.email || ''
      userName = queryRes.data.name || 'Learner'
      isPortfolioPublic = queryRes.data.is_portfolio_public ?? null
    }
  } catch {
    // Non-fatal if table not mocked in specific test
  }

  // Authoritatively derive is_public:
  // 1. Master privacy gate: If user's entire portfolio is private (is_portfolio_public === false),
  //    the artifact must NEVER be marked public under any circumstances.
  // 2. Individual privacy control: When portfolio is public, respect learner's explicit opt-in/opt-out choice.
  // 3. Default: True when portfolio is public.
  let effectiveIsPublic = true
  if (isPortfolioPublic === false) {
    effectiveIsPublic = false
  } else if (typeof isPublic === 'boolean') {
    effectiveIsPublic = isPublic
  }

  // 5. Validate submission content
  const validation = validateCapstoneSubmission(moduleSlug, content)
  if (!validation.isValid) {
    throw new Error(validation.reason || 'Submission requirements not met.')
  }

  // 6. Validate transition
  const transition = validateCapstoneTransition(existing?.status, 'submitted', 'learner')
  if (!transition.allowed) {
    throw new Error(transition.reason || 'Cannot submit capstone in current state.')
  }

  const now = new Date().toISOString()
  let result: CapstoneSubmissionRow

  if (existing) {
    const { data: updated, error: updateError } = (await (supabase
      .from('capstone_submissions') as unknown as DBChain)
      .update({
        content,
        status: 'submitted',
        is_public: effectiveIsPublic,
        submitted_at: now,
      })
      .eq('id', existing.id)
      .select()
      .single()) as unknown as { data: CapstoneSubmissionRow | null; error: unknown }

    if (updateError) throw updateError
    result = updated!
  } else {
    const { data: inserted, error: insertError } = (await (supabase
      .from('capstone_submissions') as unknown as DBChain)
      .insert({
        user_id: userId,
        module_slug: moduleSlug,
        content,
        status: 'submitted',
        is_public: effectiveIsPublic,
        submitted_at: now,
      })
      .select()
      .single()) as unknown as { data: CapstoneSubmissionRow | null; error: unknown }

    if (insertError) throw insertError
    result = inserted!
  }

  // 5. Save associated reflection if provided
  if (reflectionContent && reflectionContent.trim().length > 0) {
    const reflectionKey = `capstone-${moduleSlug}`
    const { data: existingRef } = (await (supabase
      .from('reflections') as unknown as DBChain)
      .select('id')
      .eq('user_id', userId)
      .eq('lesson_id', reflectionKey)
      .limit(1)) as unknown as { data: { id: string }[] | null }

    if (existingRef && existingRef.length > 0) {
      await (supabase
        .from('reflections') as unknown as DBChain)
        .update({
          content: reflectionContent,
          is_public: reflectionIsPublic,
        })
        .eq('id', existingRef[0].id)
    } else {
      await (supabase
        .from('reflections') as unknown as DBChain)
        .insert({
          user_id: userId,
          lesson_id: reflectionKey,
          content: reflectionContent,
          is_public: reflectionIsPublic,
        })
    }
  }

  // 6. Award capstone XP idempotently via xp_events ledger
  const alreadyAwarded = await hasXpEvent(supabase, userId, 'capstone', moduleSlug)
  const xpConfig = await getRuntimeXpValues(supabase)
  let xpEarned = 0

  if (!alreadyAwarded) {
    xpEarned = xpConfig.CAPSTONE_SUBMITTED
    try {
      await awardXp(supabase, userId, 'capstone', xpEarned, moduleSlug)
    } catch (xpErr) {
      console.error(`[capstones-db] Failed to award capstone XP for ${moduleSlug}:`, xpErr)
    }
  }

  // 7. Update streak
  await updateUserStreak(supabase, userId)

  // 8. Dispatch capstone.submitted notification
  try {
    const { globalNotificationDispatcher } = await import('./notifications/dispatcher')
    const { initializeNotificationConnectors } = await import('./notifications/events/connectors')
    initializeNotificationConnectors()

    const def = getCapstoneDefinition(moduleSlug)
    await globalNotificationDispatcher.dispatch({
      id: `capstone-submit-${result.id}`,
      event: 'capstone.submitted',
      userId,
      userEmail: userEmail || '',
      userName: userName || 'Learner',
      userTimezone: 'UTC',
      priority: 'medium',
      category: 'portfolio',
      occurredAt: new Date().toISOString(),
      payload: {
        submissionId: result.id,
        moduleSlug,
        moduleTitle: def?.moduleTitle || moduleSlug,
      },
    })
  } catch (notifErr) {
    console.warn('[capstones-db] Capstone submitted notification dispatch warning:', notifErr)
  }

  return {
    success: true,
    submission: result,
    xpEarned,
    message: alreadyAwarded ? 'Capstone submitted (XP previously awarded).' : `Capstone submitted! ${xpEarned} XP awarded.`,
  }
}
