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
    isPortfolioPublic: boolean
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
      isPortfolioPublic: user.is_portfolio_public ?? true,
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
    publicReflectionsCount: reflections?.length ?? 0,
  }
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
    .select('username, name, bio, avatar_url, linkedin_url, github_url, website_url, is_portfolio_public')
    .eq('id', userId)
    .single()) as unknown as { data: UserRow | null; error: unknown }

  if (error || !user) {
    throw new Error('User profile not found.')
  }

  // Auto-generate username from name or id if not set
  const fallbackUsername = user.name
    ? user.name.toLowerCase().replace(/[^a-z0-9]/g, '')
    : `user_${userId.substring(0, 8)}`

  return {
    username: user.username || fallbackUsername,
    name: user.name || '',
    bio: user.bio || '',
    avatarUrl: user.avatar_url || '',
    linkedinUrl: user.linkedin_url || '',
    githubUrl: user.github_url || '',
    websiteUrl: user.website_url || '',
    isPortfolioPublic: user.is_portfolio_public ?? true,
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
  const updatePayload = {
    username: cleanUsername,
    name: settings.name.trim() || null,
    bio: settings.bio.trim() || null,
    avatar_url: settings.avatarUrl.trim() || null,
    linkedin_url: settings.linkedinUrl.trim() || null,
    github_url: settings.githubUrl.trim() || null,
    website_url: settings.websiteUrl.trim() || null,
    is_portfolio_public: Boolean(settings.isPortfolioPublic),
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
      name: updatePayload.name || '',
      bio: updatePayload.bio || '',
      avatarUrl: updatePayload.avatar_url || '',
      linkedinUrl: updatePayload.linkedin_url || '',
      githubUrl: updatePayload.github_url || '',
      websiteUrl: updatePayload.website_url || '',
      isPortfolioPublic: updatePayload.is_portfolio_public,
    },
  }
}
