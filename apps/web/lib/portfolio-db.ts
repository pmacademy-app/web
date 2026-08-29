/**
 * Portfolio Database Operations Service (Phase 3 Sprint 2)
 *
 * Handles server-side queries for public portfolio rendering
 * and authenticated user portfolio settings updates.
 *
 * Enforces strict privacy rules: private portfolios and private reflections are never exposed.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase'
import { calculateLevel, type LevelInfo } from '@/lib/xp'
import { getSkillRadarSummary, type SkillRadarSummary } from '@/lib/skillRadar'
import { getCapstoneDefinition } from '@/config/capstones'
import { validateUsername, validateOptionalUrl } from '@/lib/portfolio'
import { resolveAvatarPublicUrl } from '@/lib/avatar/avatar-service'
import { globalNotificationDispatcher } from '@/lib/notifications/dispatcher'
import { initializeNotificationConnectors } from '@/lib/notifications/events/connectors'

type UserRow = Database['public']['Tables']['users']['Row']
type CapstoneSubmissionRow = Database['public']['Tables']['capstone_submissions']['Row']
type ReflectionRow = Database['public']['Tables']['reflections']['Row']

interface DBChain {
  [method: string]: (...args: unknown[]) => DBChain & Promise<{ data: unknown; error: unknown }>
}

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

export type PortfolioSectionId = 'hero' | 'radar' | 'progress' | 'capstones' | 'achievements'

export const VALID_PORTFOLIO_SECTIONS: PortfolioSectionId[] = [
  'hero',
  'radar',
  'progress',
  'capstones',
  'achievements',
]

export const DEFAULT_PORTFOLIO_LAYOUT: PortfolioSectionId[] = [
  'hero',
  'radar',
  'progress',
  'capstones',
  'achievements',
]

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

  // 1. Fetch user by username (or fallback to id if matches uuid)
  const { data: users, error: userError } = (await (supabase
    .from('users') as unknown as DBChain)
    .select('*')
    .ilike('username', sanitizedUsername)
    .limit(1)) as unknown as { data: UserRow[] | null; error: unknown }

  if (userError || !users || users.length === 0) {
    return null
  }

  const user = users[0]

  // Enforce privacy invariant: If portfolio is private, hide from public callers
  if (user.is_portfolio_public === false) {
    return null
  }

  const userId = user.id

  // 2. Fetch Skill Radar using existing backend service
  const skillRadar = await getSkillRadarSummary(supabase, userId)

  // 3. Fetch completed lesson progress
  const { data: progressRows } = (await (supabase
    .from('user_lesson_progress') as unknown as DBChain)
    .select('lesson_id, status')
    .eq('user_id', userId)
    .eq('status', 'completed')) as unknown as { data: { lesson_id: string; status: string }[] | null }

  const completedLessonsCount = progressRows?.length ?? 0
  const totalLessonsCount = 90
  const completedModulesCount = Math.min(9, Math.floor(completedLessonsCount / 10))
  const progressPercentage = Math.min(100, Math.round((completedLessonsCount / totalLessonsCount) * 100))

  // 4. Fetch public submitted capstones (respecting individual is_public opt-out and admin moderation unpublish)
  const { data: submissions } = (await (supabase
    .from('capstone_submissions') as unknown as DBChain)
    .select('*')
    .eq('user_id', userId)
    .in('status', ['submitted', 'reviewed'])
    .neq('is_public', false)
    .order('submitted_at', { ascending: false })) as unknown as { data: CapstoneSubmissionRow[] | null }

  // 5. Fetch public reflections only
  const { data: reflections } = (await (supabase
    .from('reflections') as unknown as DBChain)
    .select('*')
    .eq('user_id', userId)
    .eq('is_public', true)) as unknown as { data: ReflectionRow[] | null }

  const publicReflectionMap = new Map<string, ReflectionRow>()
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
    const wordCount = sub.content.trim().split(/\s+/).filter(Boolean).length

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

  const rawLayout = (user as unknown as { portfolio_layout?: unknown }).portfolio_layout
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

  const featuredCapstoneId = (user as unknown as { featured_capstone_id?: string | null }).featured_capstone_id || null
  const portfolioViewCount = Number((user as unknown as { portfolio_view_count?: number }).portfolio_view_count || 0)

  // Authoritative Privacy Invariant:
  // The featured capstone must strictly be resolved from the PUBLIC `capstones` list.
  // If the learner has opted out of public visibility for this specific capstone or it was rejected,
  // it is not in `capstones` and featuredCapstone evaluates strictly to null.
  const featuredCapstone = featuredCapstoneId
    ? capstones.find((c) => c.id === featuredCapstoneId) || null
    : null

  // Increment view count asynchronously (fire-and-forget, non-blocking)
  incrementPortfolioViewCount(supabase, user.id).catch(() => {})

  return {
    user: {
      id: user.id,
      username: user.username || username,
      name: user.name || user.username || 'PM Academy Learner',
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
 * Atomically increments the portfolio visitor count for a user if public.
 * Safe, non-blocking, and never throws.
 */
export async function incrementPortfolioViewCount(
  supabase: SupabaseClient<Database>,
  userId: string
): Promise<void> {
  try {
    // 1. Try atomic RPC procedure if available
    if (typeof (supabase as unknown as { rpc?: unknown }).rpc === 'function') {
      const rpcRes = await (supabase as unknown as {
        rpc: (fn: string, args: Record<string, unknown>) => Promise<{ error: unknown }>
      }).rpc('increment_portfolio_view_count', { target_user_id: userId })

      if (!rpcRes?.error) {
        return
      }
    }

    // 2. Fallback to transactional select + update if RPC is not present
    const { data: userRec } = (await (supabase
      .from('users') as unknown as DBChain)
      .select('portfolio_view_count, is_portfolio_public')
      .eq('id', userId)
      .maybeSingle()) as unknown as {
        data: { portfolio_view_count: number | null; is_portfolio_public: boolean | null } | null
      }

    if (userRec && userRec.is_portfolio_public) {
      await (supabase
        .from('users') as unknown as DBChain)
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
  const { data: rows } = (await (supabase
    .from('capstone_submissions') as unknown as DBChain)
    .select('id, module_slug, is_public, submitted_at, status')
    .eq('user_id', userId)
    .in('status', ['submitted', 'reviewed'])
    .order('submitted_at', { ascending: false })) as unknown as {
      data: Array<{
        id: string
        module_slug: string
        is_public: boolean
        submitted_at: string
        status: string
      }> | null
    }

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
export async function getPortfolioSettings(
  supabase: SupabaseClient<Database>,
  userId: string
): Promise<PortfolioSettingsData> {
  const { data: user, error } = (await (supabase
    .from('users') as unknown as DBChain)
    .select('username, name, bio, avatar_url, linkedin_url, github_url, website_url, is_portfolio_public, portfolio_layout, featured_capstone_id, portfolio_view_count')
    .eq('id', userId)
    .single()) as unknown as { data: (UserRow & { portfolio_layout?: unknown; featured_capstone_id?: string | null; portfolio_view_count?: number }) | null; error: unknown }

  if (error || !user) {
    throw new Error('User profile not found.')
  }

  // Auto-generate username from name or id if not set
  const fallbackUsername = user.name
    ? user.name.toLowerCase().replace(/[^a-z0-9]/g, '')
    : `user_${userId.substring(0, 8)}`

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
  }
}

/**
 * Updates portfolio settings for the authenticated user.
 */
export async function updatePortfolioSettings(
  supabase: SupabaseClient<Database>,
  userId: string,
  settings: PortfolioSettingsData
): Promise<{ success: boolean; settings: PortfolioSettingsData }> {
  // 1. Validate username
  const usernameCheck = validateUsername(settings.username)
  if (!usernameCheck.isValid) {
    throw new Error(usernameCheck.reason || 'Invalid username.')
  }

  const cleanUsername = settings.username.trim().toLowerCase()

  // 2. Validate URLs
  if (!validateOptionalUrl(settings.linkedinUrl)) {
    throw new Error('LinkedIn URL must begin with http:// or https://')
  }
  if (!validateOptionalUrl(settings.githubUrl)) {
    throw new Error('GitHub URL must begin with http:// or https://')
  }
  if (!validateOptionalUrl(settings.websiteUrl)) {
    throw new Error('Website URL must begin with http:// or https://')
  }

  // 3. Check for unique username collision
  const { data: existingUsers } = (await (supabase
    .from('users') as unknown as DBChain)
    .select('id')
    .ilike('username', cleanUsername)
    .neq('id', userId)
    .limit(1)) as unknown as { data: { id: string }[] | null }

  if (existingUsers && existingUsers.length > 0) {
    throw new Error('This username is already taken by another user.')
  }

  // 4. Update user record
  const updatePayload: Record<string, unknown> = {
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
      const { data: capstoneRec } = (await (supabase
        .from('capstone_submissions') as unknown as DBChain)
        .select('id, user_id, status')
        .eq('id', featId)
        .eq('user_id', userId)
        .maybeSingle()) as unknown as { data: { id: string; user_id: string; status: string } | null }

      if (!capstoneRec) {
        throw new Error('Selected featured capstone does not exist or does not belong to you.')
      }

      updatePayload.featured_capstone_id = featId
    } else {
      updatePayload.featured_capstone_id = null
    }
  }

  const { error: updateError } = await (supabase
    .from('users') as unknown as DBChain)
    .update(updatePayload)
    .eq('id', userId)

  if (updateError) {
    console.error('[portfolio-db] Error updating user portfolio settings:', updateError)
    throw new Error('Failed to update portfolio settings.')
  }

  if (updatePayload.is_portfolio_public) {
    try {
      const { data: userRec } = await (supabase
        .from('users') as unknown as DBChain)
        .select('email, name')
        .eq('id', userId)
        .maybeSingle() as unknown as { data: { email: string; name: string | null } | null }

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
          portfolioUrl: `https://prodily.adityagangwani.me/p/${cleanUsername}`,
        },
      })
    } catch (dispatchErr) {
      console.warn('[portfolio-db] Non-fatal notification dispatch warning:', dispatchErr)
    }
  }

  return {
    success: true,
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

export interface PublicPortfolioSitemapEntry {
  username: string
  updatedAt?: string | null
  createdAt?: string | null
}

/**
 * Queries all publicly indexable portfolio users for XML sitemap generation.
 * Strictly filters for is_portfolio_public = true and valid, non-empty usernames.
 * Private, unconfigured, or invalid username accounts are excluded.
 */
export async function getPublicPortfolioSitemapEntries(
  supabase: SupabaseClient<Database>
): Promise<PublicPortfolioSitemapEntry[]> {
  try {
    const { data: users, error } = (await (supabase
      .from('users') as unknown as DBChain)
      .select('username, created_at')
      .eq('is_portfolio_public', true)
      .not('username', 'is', null)
      .neq('username', '')) as unknown as {
      data: { username: string; created_at?: string | null }[] | null
      error: unknown
    }

    if (error || !users) {
      return []
    }

    return users
      .filter((u) => u.username && validateUsername(u.username).isValid)
      .map((u) => ({
        username: u.username,
        createdAt: u.created_at ?? null,
      }))
  } catch (err) {
    console.error('[portfolio-db] Error fetching public portfolio sitemap entries:', err)
    return []
  }
}

