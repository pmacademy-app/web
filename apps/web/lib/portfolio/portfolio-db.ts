/**
 * Portfolio Database Operations Service (Phase 3 Sprint 2)
 *
 * Handles server-side queries for public portfolio rendering
 * and authenticated user portfolio settings updates.
 *
 * Enforces strict privacy rules: private portfolios and private reflections are never exposed.
 */

import { CURRICULUM_LESSON_COUNT, countCompletedModules } from '@/lib/curriculum-registry'
import { BRAND } from '@/lib/brand'
import { cache } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, TablesUpdate } from '@/lib/supabase'
import { calculateLevel, type LevelInfo } from '@/lib/xp/xp'
import { getSkillRadarSummary, type SkillRadarPreloadedData, type SkillRadarSummary } from '@/lib/skillRadar'
import { getCapstoneDefinition } from '@/config/capstones'
import { escapeLike } from '@/lib/db/escape-like'
import {
  validateUsername,
  validateWritableUrl,
  DEFAULT_PORTFOLIO_LAYOUT,
  VALID_PORTFOLIO_SECTIONS,
  type PortfolioSectionId,
} from '@/lib/portfolio/portfolio'
import {
  calculatePortfolioReadiness,
  calculatePortfolioVerification,
  type PortfolioVerificationOverride,
  portfolioFallbackUsername as portfolioFallbackUsernameFor,
} from '@/lib/portfolio/portfolio-readiness'
import { isValidAvatarUrl } from '@/lib/avatar/avatar-service'
import { resolveAvatarPublicUrl } from '@/lib/avatar/avatar-service'
import { globalNotificationDispatcher } from '@/lib/notifications/dispatcher'
import { initializeNotificationConnectors } from '@/lib/notifications/events/connectors'

type PublicReflectionRow = Pick<Database['public']['Tables']['reflections']['Row'], 'lesson_id' | 'content' | 'created_at'>
type SkillRadarProgressRow = NonNullable<SkillRadarPreloadedData['progressRows']>[number]

/** The user columns the public portfolio renders. Nothing else is read, so nothing else can leak. */
const PUBLIC_PORTFOLIO_USER_COLUMNS =
  'id, username, name, bio, avatar_url, linkedin_url, github_url, website_url, current_streak, longest_streak, total_xp, is_fellow, is_portfolio_public, portfolio_layout, featured_capstone_id, portfolio_view_count, portfolio_verification_override'

export interface PublicCapstoneItem {
  id: string
  moduleSlug: string
  moduleNumber: number
  moduleTitle: string
  title: string
  deliverableType: string
  content: string
  submittedAt: string
  wordCount: number
  status: string
  competencyCluster: string
  learningObjectives: string[]
  reflection: {
    content: string
    createdAt: string
  } | null
}

// Re-exported from the dependency-free module so server call sites are unchanged.
// A browser consumer must import them from `@/lib/portfolio` directly — importing
// them from here pulls the whole server data layer into the client bundle.
export { VALID_PORTFOLIO_SECTIONS, DEFAULT_PORTFOLIO_LAYOUT } from '@/lib/portfolio/portfolio'
export type { PortfolioSectionId } from '@/lib/portfolio/portfolio'

export interface PublicPortfolioPayload {
  user: {
    id: string
    username: string
    name: string
    bio: string | null
    avatarUrl: string | null
    linkedinUrl: string | null
    githubUrl: string | null
    websiteUrl: string | null
    currentStreak: number
    longestStreak: number
    totalXp: number
    levelInfo: LevelInfo
    isFellow: boolean
    isPortfolioVerified: boolean
    isPortfolioPublic: boolean
    portfolioLayout: PortfolioSectionId[]
    featuredCapstoneId: string | null
    portfolioViewCount: number
  }
  progress: {
    completedLessonsCount: number
    totalLessonsCount: number
    completedModulesCount: number
    totalModulesCount: number
    progressPercentage: number
  }
  skillRadar: SkillRadarSummary
  capstones: PublicCapstoneItem[]
  featuredCapstone: PublicCapstoneItem | null
  publicReflectionsCount: number
}

export interface PortfolioSettingsData {
  username: string
  name: string
  bio: string
  avatarUrl: string
  linkedinUrl: string
  githubUrl: string
  websiteUrl: string
  isPortfolioPublic: boolean
  portfolioLayout?: PortfolioSectionId[]
  featuredCapstoneId?: string | null
  portfolioViewCount?: number
  /** Admin override for automatic Portfolio Verification, if any (null = automatic). */
  verificationOverride?: PortfolioVerificationOverride
}

export interface LearnerSubmittedCapstoneSummary {
  id: string
  moduleSlug: string
  moduleNumber: number
  moduleTitle: string
  title: string
  deliverableType: string
  isPublic: boolean
  submittedAt: string
}

/**
 * Retrieves full public portfolio data by username.
 * Returns null if user is not found or profile is marked private.
 */
export async function getPublicPortfolioData(
  supabase: SupabaseClient<Database>,
  username: string
): Promise<PublicPortfolioPayload | null> {
  const sanitizedUsername = username.trim().toLowerCase()
  if (!sanitizedUsername) return null

  // 1. Fetch the user by username: an exact match on the stored value, which the
  // users.username unique index serves directly. Usernames are always written lowercase
  // (updatePortfolioSettings lowercases before saving; the pending CQ-24 constraint pins
  // [a-z0-9_-]), so equality on the lowercased handle finds every reachable portfolio.
  // The previous ILIKE could not use that index and scanned users on every view. `eq` has
  // no wildcards, so no LIKE escaping is needed.
  const { data: users, error: userError } = await supabase
    .from('users')
    .select(PUBLIC_PORTFOLIO_USER_COLUMNS)
    .eq('username', sanitizedUsername)
    .limit(1)

  if (userError || !users || users.length === 0) {
    return null
  }

  const user = users[0]

  // Enforce privacy invariant: If portfolio is private, hide from public callers
  if (user.is_portfolio_public === false) {
    return null
  }

  const userId = user.id

  // 2-4. The remaining reads depend only on the user id, so they run together. Lesson
  // progress is read once, with the columns the skill radar needs, and handed to it,
  // instead of the radar reading the same table a second time.
  const [progressRes, submissionsRes, reflectionsRes] = await Promise.all([
    supabase
      .from('user_lesson_progress')
      .select('lesson_id, status, quiz_score, quiz_attempts')
      .eq('user_id', userId),
    // Public submitted capstones (respecting individual is_public opt-out and admin moderation unpublish)
    supabase
      .from('capstone_submissions')
      .select('id, module_slug, content, submitted_at, status')
      .eq('user_id', userId)
      .in('status', ['submitted', 'reviewed'])
      .neq('is_public', false)
      .order('submitted_at', { ascending: false }),
    // Public reflections only
    supabase
      .from('reflections')
      .select('lesson_id, content, created_at')
      .eq('user_id', userId)
      .eq('is_public', true),
  ])

  if (progressRes.error) {
    console.error('[portfolio-db] Error fetching user_lesson_progress for portfolio:', progressRes.error)
  }
  const allProgressRows = (progressRes.data ?? []) as SkillRadarProgressRow[]
  const skillRadar = await getSkillRadarSummary(supabase, userId, { progressRows: allProgressRows })

  const completedLessonIds = allProgressRows.filter((p) => p.status === 'completed').map((p) => p.lesson_id)
  const completedLessonsCount = completedLessonIds.length
  const totalLessonsCount = CURRICULUM_LESSON_COUNT
  const completedModulesCount = countCompletedModules(completedLessonIds)
  const progressPercentage = Math.min(100, Math.round((completedLessonsCount / totalLessonsCount) * 100))

  const submissions = submissionsRes.data
  const reflections = reflectionsRes.data

  const publicReflectionMap = new Map<string, PublicReflectionRow>()
  if (reflections) {
    for (const ref of reflections) {
      publicReflectionMap.set(ref.lesson_id, ref)
    }
  }

  // Format capstone cards
  const capstones: PublicCapstoneItem[] = (submissions ?? []).map((sub) => {
    const def = getCapstoneDefinition(sub.module_slug)
    const reflectionKey = `capstone-${sub.module_slug}`
    const ref = publicReflectionMap.get(reflectionKey)
    const wordCount = (sub.content || '').trim().split(/\s+/).filter(Boolean).length

    return {
      id: sub.id,
      moduleSlug: sub.module_slug,
      moduleNumber: def?.moduleNumber ?? 1,
      moduleTitle: def?.moduleTitle ?? sub.module_slug,
      title: def?.title ?? 'Module Capstone Deliverable',
      deliverableType: def?.deliverableType ?? 'Deliverable',
      content: sub.content,
      submittedAt: sub.submitted_at,
      wordCount,
      status: sub.status,
      competencyCluster: def?.competencyCluster ?? 'strategy',
      learningObjectives: def?.learningObjectives ?? [],
      reflection: ref
        ? {
            content: ref.content,
            createdAt: ref.created_at,
          }
        : null,
    }
  })

  const levelInfo = calculateLevel(user.total_xp || 0)

  const rawLayout = (user).portfolio_layout
  let portfolioLayout: PortfolioSectionId[] = DEFAULT_PORTFOLIO_LAYOUT

  if (Array.isArray(rawLayout) && rawLayout.length > 0) {
    const validSections = rawLayout.filter((s): s is PortfolioSectionId =>
      VALID_PORTFOLIO_SECTIONS.includes(s as PortfolioSectionId)
    )
    if (validSections.length > 0) {
      portfolioLayout = validSections.includes('hero')
        ? validSections
        : ['hero', ...validSections]
    }
  }

  const featuredCapstoneId = (user).featured_capstone_id || null
  const portfolioViewCount = Number((user).portfolio_view_count || 0)

  // Authoritative Privacy Invariant:
  // The featured capstone must strictly be resolved from the PUBLIC `capstones` list.
  // If the learner has opted out of public visibility for this specific capstone or it was rejected,
  // it is not in `capstones` and featuredCapstone evaluates strictly to null.
  const featuredCapstone = featuredCapstoneId
    ? capstones.find((c) => c.id === featuredCapstoneId) || null
    : null

  // Portfolio Verification: computed live from data already loaded above — no
  // extra query. Reuses the same readiness signals as the Settings checklist.
  const verificationOverride = ((user)
    .portfolio_verification_override ?? null) as PortfolioVerificationOverride
  const readinessForVerification = calculatePortfolioReadiness({
    name: user.name,
    username: user.username,
    bio: user.bio,
    avatarUrl: user.avatar_url,
    linkedinUrl: user.linkedin_url,
    githubUrl: user.github_url,
    websiteUrl: user.website_url,
    isPortfolioPublic: user.is_portfolio_public,
    publicCapstonesCount: capstones.length,
  })
  const verification = calculatePortfolioVerification(
    readinessForVerification,
    { linkedinUrl: user.linkedin_url, githubUrl: user.github_url, websiteUrl: user.website_url },
    verificationOverride
  )

  return {
    user: {
      id: user.id,
      username: user.username || username,
      name: user.name || user.username || BRAND.learnerFallbackName,
      bio: user.bio ?? null,
      avatarUrl: resolveAvatarPublicUrl(user.avatar_url) ?? null,
      linkedinUrl: user.linkedin_url ?? null,
      githubUrl: user.github_url ?? null,
      websiteUrl: user.website_url ?? null,
      currentStreak: user.current_streak || 0,
      longestStreak: user.longest_streak || 0,
      totalXp: user.total_xp || 0,
      levelInfo,
      isFellow: Boolean(user.is_fellow),
      isPortfolioVerified: verification.isVerified,
      isPortfolioPublic: user.is_portfolio_public ?? true,
      portfolioLayout,
      featuredCapstoneId,
      portfolioViewCount,
    },
    progress: {
      completedLessonsCount,
      totalLessonsCount,
      completedModulesCount,
      totalModulesCount: 9,
      progressPercentage,
    },
    skillRadar,
    capstones,
    featuredCapstone,
    publicReflectionsCount: reflections?.length ?? 0,
  }
}

/**
 * Render-scoped deduplication of the public portfolio read.
 *
 * `generateMetadata()` and the page component both need the payload; React's `cache()`
 * collapses them into one computation per render.
 *
 * The cross-request cache is the page itself (perf plan item 13): /p/[username] and its
 * capstone pages are ISR with `revalidate = 3600`, so this runs once per regeneration, not
 * once per view. A private or missing portfolio renders as "unavailable" and that result is
 * cached too, which is safe because every write that changes what the page shows purges the
 * exact paths (lib/portfolio/portfolio-revalidate.ts): the portfolio settings save (visibility,
 * profile, username old and new), profile edits, capstone submit and review, capstone
 * reflections, and account deletion. Nothing here reads cookies or headers, and the payload
 * is the same for every viewer.
 */
export const getDedupedPublicPortfolioData = cache(
  async (username: string): Promise<PublicPortfolioPayload | null> => {
    const { createServiceRoleClient } = await import('@/lib/supabase')
    return getPublicPortfolioData(createServiceRoleClient(), username.trim().toLowerCase())
  }
)

/**
 * Records one public view of a portfolio, looked up by username.
 *
 * Called from POST /api/portfolio/[username]/view (the client beacon on the cached page), never
 * during render: a cached page cannot count views, and a write in render would make the page
 * uncacheable. Resolves the id with the same exact, indexed username match as the page and only
 * for a public portfolio; `incrementPortfolioViewCount` re-checks visibility itself. Never throws.
 */
export async function recordPortfolioView(
  supabase: SupabaseClient<Database>,
  username: string
): Promise<boolean> {
  try {
    const handle = username.trim().toLowerCase()
    if (!handle) return false
    const { data, error } = await supabase
      .from('users')
      .select('id')
      .eq('username', handle)
      .eq('is_portfolio_public', true)
      .maybeSingle()
    if (error || !data?.id) return false
    await incrementPortfolioViewCount(supabase, data.id)
    return true
  } catch (err) {
    console.warn('[portfolio-db] Non-fatal portfolio view record warning:', err)
    return false
  }
}

/**
 * Atomically increments the portfolio visitor count for a user if public.
 * Safe, non-blocking, and never throws.
 */
export async function incrementPortfolioViewCount(
  supabase: SupabaseClient<Database>,
  userId: string
): Promise<void> {
  try {
    // 1. Try atomic RPC procedure if available.
    //
    // `increment_portfolio_view_count` is created by migration
    // `20260827000001_phase5_portfolio_evolution.sql` and re-granted by
    // `20260910000001_security_hardening_b1.sql`, but it is absent from the
    // generated `types/database.ts`.
    //
    // Not because the types are stale, which an earlier version of this comment
    // claimed. `types/database.ts` was regenerated on 2026-09-09, two weeks after
    // that migration, and the same migration's `users.featured_capstone_id` and
    // `users.portfolio_view_count` columns ARE present — so the migration was
    // applied and `supabase gen types` simply did not emit the function.
    // `get_admin_dashboard_summary` is missing for the same reason, and both are
    // reached through the same narrow cast elsewhere in the codebase; it is the
    // repository's existing convention for this situation, not a new workaround.
    // Regenerating would therefore NOT remove this cast.
    //
    // The cast is narrowed to the `rpc` method alone, names the argument shape
    // rather than using `any`, and the fallback below already covers the RPC being
    // unavailable at runtime.
    const callRpc = supabase.rpc as unknown as (
      fn: 'increment_portfolio_view_count',
      args: { target_user_id: string }
    ) => Promise<{ error: unknown } | null>

    if (typeof supabase.rpc === 'function') {
      const rpcRes = await callRpc.call(supabase, 'increment_portfolio_view_count', {
        target_user_id: userId,
      })

      if (!rpcRes?.error) {
        return
      }
    }

    // 2. Fallback to transactional select + update if RPC is not present
    const { data: userRec } = await supabase
      .from('users')
      .select('portfolio_view_count, is_portfolio_public')
      .eq('id', userId)
      .maybeSingle()

    if (userRec && userRec.is_portfolio_public) {
      await supabase
        .from('users')
        .update({
          portfolio_view_count: (userRec.portfolio_view_count ?? 0) + 1,
        })
        .eq('id', userId)
    }
  } catch (err) {
    console.warn('[portfolio-db] Non-fatal portfolio view increment warning:', err)
  }
}

/**
 * Returns a list of submitted/reviewed capstones belonging to the learner.
 * Used for populating the "Featured Deliverable" selector in Settings.
 */
export async function getLearnerSubmittedCapstones(
  supabase: SupabaseClient<Database>,
  userId: string
): Promise<LearnerSubmittedCapstoneSummary[]> {
  const { data: rows } = await supabase
    .from('capstone_submissions')
    .select('id, module_slug, is_public, submitted_at, status')
    .eq('user_id', userId)
    .in('status', ['submitted', 'reviewed'])
    .order('submitted_at', { ascending: false })

  return (rows ?? []).map((row) => {
    const def = getCapstoneDefinition(row.module_slug)
    return {
      id: row.id,
      moduleSlug: row.module_slug,
      moduleNumber: def?.moduleNumber ?? 1,
      moduleTitle: def?.moduleTitle ?? row.module_slug,
      title: def?.title ?? 'Module Capstone Deliverable',
      deliverableType: def?.deliverableType ?? 'Deliverable',
      isPublic: Boolean(row.is_public),
      submittedAt: row.submitted_at,
    }
  })
}

/**
 * Retrieves portfolio settings for the authenticated user.
 */
/**
 * A portfolio-settings rejection the learner caused and can fix — a taken
 * username, a non-https URL, a capstone that is not theirs.
 *
 * Typed so the route can answer 400 with this exact message while everything else
 * that throws from this module stays an unexpected fault and is genericised by
 * `withRoute`. Before B7-F the settings route returned `error.message` for both
 * cases, which is how a driver error could have reached a learner (N-3).
 *
 * The message must therefore always be copy we wrote, never provider text.
 */
export class PortfolioValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PortfolioValidationError'
  }
}

// Pure helpers, re-exported for existing callers; they live with the readiness model.
export { portfolioFallbackUsername, portfolioReadinessInputFromUserRow } from '@/lib/portfolio/portfolio-readiness'

export async function getPortfolioSettings(
  supabase: SupabaseClient<Database>,
  userId: string
): Promise<PortfolioSettingsData> {
  const { data: user, error } = await supabase
    .from('users')
    .select('username, name, bio, avatar_url, linkedin_url, github_url, website_url, is_portfolio_public, portfolio_layout, featured_capstone_id, portfolio_view_count, portfolio_verification_override')
    .eq('id', userId)
    .single()

  if (error || !user) {
    throw new Error('User profile not found.')
  }

  const fallbackUsername = portfolioFallbackUsernameFor(user.name, userId)

  const rawLayout = user.portfolio_layout
  const portfolioLayout: PortfolioSectionId[] = Array.isArray(rawLayout) && rawLayout.length > 0
    ? (rawLayout as PortfolioSectionId[])
    : DEFAULT_PORTFOLIO_LAYOUT

  return {
    username: user.username || fallbackUsername,
    name: user.name || '',
    bio: user.bio || '',
    avatarUrl: user.avatar_url || '',
    linkedinUrl: user.linkedin_url || '',
    githubUrl: user.github_url || '',
    websiteUrl: user.website_url || '',
    isPortfolioPublic: user.is_portfolio_public ?? true,
    portfolioLayout,
    featuredCapstoneId: user.featured_capstone_id || null,
    portfolioViewCount: Number(user.portfolio_view_count || 0),
    verificationOverride: (user.portfolio_verification_override ?? null) as PortfolioVerificationOverride,
  }
}

/**
 * Updates portfolio settings for the authenticated user.
 */
export async function updatePortfolioSettings(
  supabase: SupabaseClient<Database>,
  userId: string,
  settings: PortfolioSettingsData
): Promise<{ success: boolean; settings: PortfolioSettingsData; previousUsername: string | null }> {
  // 1. Validate username
  const usernameCheck = validateUsername(settings.username)
  if (!usernameCheck.isValid) {
    throw new PortfolioValidationError(usernameCheck.reason || 'Invalid username.')
  }

  const cleanUsername = settings.username.trim().toLowerCase()

  // 2. Validate URLs. https-only on write (N-2); stored http:// values keep
  //    rendering, because the read-side guard is a separate function.
  if (!validateWritableUrl(settings.linkedinUrl)) {
    throw new PortfolioValidationError('LinkedIn URL must start with https://')
  }
  if (!validateWritableUrl(settings.githubUrl)) {
    throw new PortfolioValidationError('GitHub URL must start with https://')
  }
  if (!validateWritableUrl(settings.websiteUrl)) {
    throw new PortfolioValidationError('Website URL must start with https://')
  }

  // 3. Check for unique username collision
  const { data: existingUsers } = await supabase
    .from('users')
    .select('id')
    // Escaped: `_` is common in usernames and is a single-character wildcard in ILIKE.
    .ilike('username', escapeLike(cleanUsername))
    .neq('id', userId)
    .limit(1)

  if (existingUsers && existingUsers.length > 0) {
    throw new PortfolioValidationError('This username is already taken by another user.')
  }

  // SEC-13: Validate avatar URL against allowed Supabase Storage avatars bucket
  if (settings.avatarUrl && !isValidAvatarUrl(settings.avatarUrl)) {
    throw new PortfolioValidationError("Avatar URL must be hosted on Prodily's secure avatar storage.")
  }

  // 4. Update user record
  const updatePayload: TablesUpdate<'users'> = {
    username: cleanUsername,
    name: settings.name.trim() || null,
    bio: settings.bio.trim() || null,
    avatar_url: settings.avatarUrl.trim() || null,
    linkedin_url: settings.linkedinUrl.trim() || null,
    github_url: settings.githubUrl.trim() || null,
    website_url: settings.websiteUrl.trim() || null,
    is_portfolio_public: Boolean(settings.isPortfolioPublic),
  }

  if (Array.isArray(settings.portfolioLayout)) {
    const validSections = settings.portfolioLayout.filter((s): s is PortfolioSectionId =>
      VALID_PORTFOLIO_SECTIONS.includes(s as PortfolioSectionId)
    )
    const finalLayout = validSections.includes('hero')
      ? validSections
      : ['hero', ...validSections]
    updatePayload.portfolio_layout = finalLayout.length > 0 ? finalLayout : DEFAULT_PORTFOLIO_LAYOUT
  }

  // 4. Validate featured capstone ownership and existence
  if ('featuredCapstoneId' in settings) {
    const featId = typeof settings.featuredCapstoneId === 'string' ? settings.featuredCapstoneId.trim() : null
    if (featId) {
      const { data: capstoneRec } = await supabase
        .from('capstone_submissions')
        .select('id, user_id, status')
        .eq('id', featId)
        .eq('user_id', userId)
        .maybeSingle()

      if (!capstoneRec) {
        throw new PortfolioValidationError('Selected featured capstone does not exist or does not belong to you.')
      }

      updatePayload.featured_capstone_id = featId
    } else {
      updatePayload.featured_capstone_id = null
    }
  }

  // The handle being replaced, so the caller can purge OG cards cached under it. Best-effort:
  // a failed read only costs that purge, never the save.
  let previousUsername: string | null = null
  try {
    const { data: before } = await supabase.from('users').select('username').eq('id', userId).maybeSingle()
    previousUsername = before?.username || null
  } catch {
    previousUsername = null
  }

  const { error: updateError } = await supabase
    .from('users')
    .update(updatePayload)
    .eq('id', userId)

  if (updateError) {
    console.error('[portfolio-db] Error updating user portfolio settings:', updateError)
    throw new Error('Failed to update portfolio settings.')
  }

  if (updatePayload.is_portfolio_public) {
    try {
      const { data: userRec } = await supabase
        .from('users')
        .select('email, name')
        .eq('id', userId)
        .maybeSingle()

      initializeNotificationConnectors()
      await globalNotificationDispatcher.dispatch({
        id: `portfolio-pub-${userId}`,
        event: 'portfolio.published',
        userId,
        userEmail: userRec?.email || '',
        userName: userRec?.name || cleanUsername,
        userTimezone: 'UTC',
        priority: 'high',
        category: 'portfolio',
        occurredAt: new Date().toISOString(),
        payload: {
          userId,
          username: cleanUsername,
          portfolioUrl: `https://prodily.app/p/${cleanUsername}`,
        },
      })
    } catch (dispatchErr) {
      console.warn('[portfolio-db] Non-fatal notification dispatch warning:', dispatchErr)
    }
  }

  return {
    success: true,
    previousUsername,
    settings: {
      username: cleanUsername,
      name: (updatePayload.name as string) || '',
      bio: (updatePayload.bio as string) || '',
      avatarUrl: (updatePayload.avatar_url as string) || '',
      linkedinUrl: (updatePayload.linkedin_url as string) || '',
      githubUrl: (updatePayload.github_url as string) || '',
      websiteUrl: (updatePayload.website_url as string) || '',
      isPortfolioPublic: Boolean(updatePayload.is_portfolio_public),
      portfolioLayout: (updatePayload.portfolio_layout as PortfolioSectionId[]) || settings.portfolioLayout || DEFAULT_PORTFOLIO_LAYOUT,
      featuredCapstoneId: (updatePayload.featured_capstone_id as string | null) ?? settings.featuredCapstoneId ?? null,
      portfolioViewCount: settings.portfolioViewCount ?? 0,
    },
  }
}

export interface PublicCapstoneSitemapEntry {
  moduleSlug: string
  submittedAt: string
}

export interface PublicPortfolioSitemapEntry {
  username: string
  updatedAt?: string | null
  createdAt?: string | null
  capstones?: PublicCapstoneSitemapEntry[]
}

/**
 * Queries all publicly indexable portfolio users and their public capstones for XML sitemap generation.
 * Strictly filters for is_portfolio_public = true and valid, non-empty usernames.
 * Private, unconfigured, or invalid username accounts are excluded.
 */
export async function getPublicPortfolioSitemapEntries(
  supabase: SupabaseClient<Database>
): Promise<PublicPortfolioSitemapEntry[]> {
  try {
    const { data: users, error } = await supabase
      .from('users')
      .select('id, username, created_at')
      .eq('is_portfolio_public', true)
      .not('username', 'is', null)
      .neq('username', '')

    if (error || !users) {
      return []
    }

    const validUsers = users.filter((u) => u.username && validateUsername(u.username).isValid)
    if (validUsers.length === 0) {
      return []
    }

    const userCapstonesMap = new Map<string, PublicCapstoneSitemapEntry[]>()
    try {
      const userIds = validUsers.map((u) => u.id).filter(Boolean)
      if (userIds.length > 0) {
        const { data: submissions } = await supabase
          .from('capstone_submissions')
          .select('user_id, module_slug, submitted_at, is_public, status')
          .in('user_id', userIds)
          .in('status', ['submitted', 'reviewed'])
          .neq('is_public', false)

        if (submissions) {
          for (const sub of submissions) {
            if (sub.user_id && sub.module_slug && sub.submitted_at) {
              if (!userCapstonesMap.has(sub.user_id)) {
                userCapstonesMap.set(sub.user_id, [])
              }
              userCapstonesMap.get(sub.user_id)!.push({
                moduleSlug: sub.module_slug,
                submittedAt: sub.submitted_at,
              })
            }
          }
        }
      }
    } catch {
      // Capstone queries are best-effort if table or mock does not support it
    }

    return validUsers.map((u) => ({
      username: u.username!,
      createdAt: u.created_at ?? null,
      capstones: userCapstonesMap.get(u.id) || [],
    }))
  } catch (err) {
    console.error('[portfolio-db] Error fetching public portfolio sitemap entries:', err)
    return []
  }
}

