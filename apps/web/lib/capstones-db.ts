/**
 * Capstone Database Operations Service (Phase 3 Sprint 1)
 *
 * Handles server-side queries and mutations for `capstone_submissions` and `reflections`.
 * Ensures authorization security, idempotency of XP awards (150 XP),
 * streak updates, and module progress synchronization.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase'
import { getAllCapstoneDefinitions } from '@/config/capstones'
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

  return definitions.map((def, idx) => {
    const sub = submissionMap.get(def.moduleSlug) ?? null
    const prevSub = idx > 0 ? submissionMap.get(definitions[idx - 1].moduleSlug) : null
    const prevCompleted = prevSub?.status === 'submitted' || prevSub?.status === 'reviewed'
    
    const moduleLessonIds = getLessonIdsForModule(def.moduleSlug)
    const totalLessons = moduleLessonIds.length > 0 ? moduleLessonIds.length : 10
    const lessonsCompleted = moduleLessonIds.length > 0
      ? moduleLessonIds.filter((id) => completedLessonIds.has(id)).length
      : 0
    
    let status: CapstoneStatus = 'locked'
    if (sub) {
      status = deriveCapstoneStatus(sub.status, lessonsCompleted)
    } else if (lessonsCompleted >= 8 || prevCompleted) {
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
  const status = deriveCapstoneStatus(submission?.status ?? null)

  return {
    submission,
    reflection,
    status: status === 'locked' ? 'unlocked' : status, // Default to unlocked if accessing page
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
  reflectionIsPublic: boolean = false
): Promise<{
  success: boolean
  submission: CapstoneSubmissionRow
  xpEarned: number
  message?: string
}> {
  // 1. Validate submission content
  const validation = validateCapstoneSubmission(moduleSlug, content)
  if (!validation.isValid) {
    throw new Error(validation.reason || 'Submission requirements not met.')
  }

  // 2. Fetch existing row to preserve or update
  const { data: existingList } = (await (supabase
    .from('capstone_submissions') as unknown as DBChain)
    .select('*')
    .eq('user_id', userId)
    .eq('module_slug', moduleSlug)
    .order('submitted_at', { ascending: false })
    .limit(1)) as unknown as { data: CapstoneSubmissionRow[] | null }

  const existing = existingList && existingList.length > 0 ? existingList[0] : null

  // 3. Idempotent duplicate submission protection
  if (existing && existing.status === 'submitted') {
    return {
      success: true,
      submission: existing,
      xpEarned: 0,
      message: 'Capstone already submitted.',
    }
  }

  // 4. Validate transition
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
        is_public: false,
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

  return {
    success: true,
    submission: result,
    xpEarned,
    message: alreadyAwarded ? 'Capstone submitted (XP previously awarded).' : `Capstone submitted! ${xpEarned} XP awarded.`,
  }
}
