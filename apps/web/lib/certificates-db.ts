/**
 * Certificate Database Operations Service (Phase 3 Sprint 3)
 *
 * Handles server-side queries for certificate generation, issuance, and verification.
 */

import { cache } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase'
import { BRAND } from '@/lib/brand'
import { calculateLevel, type LevelInfo } from '@/lib/xp'
import { generateCertificateCode } from '@/lib/certificates'
import { getLessonIdsForModule } from '@/lib/curriculum-registry'
import { PublicError } from '@/lib/errors/public-error'

export type CertificateRow = Database['public']['Tables']['certificates']['Row']

export interface IssueCertificateOptions {
  bypassPrerequisites?: boolean
}

export interface VerifiedCertificatePayload {
  id: string
  certificateCode: string
  type: string
  moduleSlug: string | null
  learnerName: string
  username: string
  avatarUrl: string | null
  levelInfo: LevelInfo
  totalXp: number
  lessonsCompleted: number
  modulesCompleted: number
  issuedAt: string
  isValid: boolean
  verificationUrl: string
  portfolioUrl: string
}

/**
 * Issues or retrieves an official certificate record for a user.
 * Strictly verifies curriculum or modular completion prerequisites before issuance.
 */
export async function issueCertificate(
  supabase: SupabaseClient<Database>,
  userId: string,
  type: string = 'full_curriculum',
  moduleSlug: string | null = null,
  options?: IssueCertificateOptions
): Promise<CertificateRow> {
  const normalizedType = type === 'module' ? 'module_completion' : type

  // 1. Fetch user state
  const { data: user, error: userError } = await supabase
    .from('users')
    .select('*')
    .eq('id', userId)
    .single()

  if (userError || !user) {
    throw new PublicError('User profile not found.', { status: 404, code: 'NOT_FOUND' })
  }

  // 2. Fetch total completed lessons count
  const { data: progressRows } = await supabase
    .from('user_lesson_progress')
    .select('lesson_id')
    .eq('user_id', userId)
    .eq('status', 'completed')

  const completedLessonIds = new Set((progressRows || []).map((p) => p.lesson_id))
  const lessonsCompleted = completedLessonIds.size
  const modulesCompleted = Math.min(9, Math.floor(lessonsCompleted / 10))
  const levelInfo = calculateLevel(user.total_xp || 0)

  // 3. Prerequisite validation (enforced unless explicit bypass provided)
  if (!options?.bypassPrerequisites) {
    if (normalizedType === 'full_curriculum') {
      if (lessonsCompleted < 90) {
        throw new PublicError(
          `Full curriculum completion certificate requires completing all 90 lessons (currently ${lessonsCompleted}/90).`,
          { status: 400, code: 'PREREQUISITES_NOT_MET' }
        )
      }
    } else if (normalizedType === 'module_completion') {
      if (!moduleSlug) {
        throw new PublicError('Module slug is required for module certificate issuance.', {
          status: 400,
          code: 'INVALID_REQUEST',
        })
      }
      const requiredLessonIds = getLessonIdsForModule(moduleSlug)
      if (requiredLessonIds.length === 0) {
        throw new PublicError(`Invalid or unrecognized module slug: "${moduleSlug}".`, {
          status: 400,
          code: 'INVALID_MODULE',
        })
      }
      const completedInModule = requiredLessonIds.filter((id) => completedLessonIds.has(id)).length
      if (completedInModule < requiredLessonIds.length) {
        throw new PublicError(
          `Module completion certificate requires completing all ${requiredLessonIds.length} lessons in this module (currently ${completedInModule}/${requiredLessonIds.length}).`,
          { status: 400, code: 'PREREQUISITES_NOT_MET' }
        )
      }
    } else {
      throw new PublicError(`Invalid certificate type: "${type}". Must be "full_curriculum" or "module_completion".`, {
        status: 400,
        code: 'INVALID_REQUEST',
      })
    }
  }

  const certCode = generateCertificateCode(userId, normalizedType, moduleSlug)

  // 4. Check if certificate already exists (idempotent lookup)
  const { data: existing } = await supabase
    .from('certificates')
    .select('*')
    .eq('certificate_code', certCode)
    .maybeSingle()

  if (existing) {
    return existing
  }

  // 5. Insert new certificate
  const newCert = {
    user_id: userId,
    certificate_code: certCode,
    type: normalizedType,
    module_slug: moduleSlug,
    learner_name: user.name || user.username || 'PM Academy Learner',
    level: levelInfo.level,
    career_title: levelInfo.title,
    total_xp: user.total_xp || 0,
    lessons_completed: lessonsCompleted,
    modules_completed: modulesCompleted,
    issued_at: new Date().toISOString(),
  }

  const { data: inserted, error: insertError } = await supabase
    .from('certificates')
    .insert(newCert)
    .select('*')
    .single()

  if (insertError || !inserted) {
    console.error('[certificates-db] Error inserting certificate:', insertError)
    throw new PublicError('Failed to issue certificate.', { status: 400, code: 'ISSUE_FAILED' })
  }

  return inserted
}

/**
 * Verifies a certificate by code or ID for public verification page.
 */
/**
 * Request-scoped deduplication of a certificate lookup.
 *
 * The verify page resolves the same certificate twice per view — once in
 * `generateMetadata()` and again in the component — and each resolution costs up to
 * two `certificates` queries plus a `users` join. `cache()` collapses that to one.
 */
export const getDedupedVerifiedCertificate = cache(
  async (codeOrId: string, siteOrigin: string = BRAND.siteUrl): Promise<VerifiedCertificatePayload | null> => {
    const { createServiceRoleClient } = await import('@/lib/supabase')
    return verifyCertificate(createServiceRoleClient(), codeOrId, siteOrigin)
  }
)

export async function verifyCertificate(
  supabase: SupabaseClient<Database>,
  codeOrId: string,
  siteOrigin: string = BRAND.siteUrl
): Promise<VerifiedCertificatePayload | null> {
  const cleanCode = codeOrId.trim()

  // 1. Query certificate by code or id
  let { data: cert } = await supabase
    .from('certificates')
    .select('*')
    .ilike('certificate_code', cleanCode)
    .maybeSingle()

  if (!cert) {
    const { data: certById } = await supabase
      .from('certificates')
      .select('*')
      .eq('id', cleanCode)
      .maybeSingle()

    cert = certById
  }

  if (!cert) {
    return null
  }

  // 2. Resolve user info
  const { data: user } = await supabase
    .from('users')
    .select('username, name, avatar_url')
    .eq('id', cert.user_id)
    .single()

  const username = user?.username || `user_${cert.user_id.substring(0, 8)}`
  const learnerName = user?.name || cert.learner_name
  const avatarUrl = user?.avatar_url || null
  const levelInfo = calculateLevel(cert.total_xp)

  const origin = siteOrigin.replace(/\/$/, '')

  return {
    id: cert.id,
    certificateCode: cert.certificate_code,
    type: cert.type,
    moduleSlug: cert.module_slug,
    learnerName,
    username,
    avatarUrl,
    levelInfo: {
      level: cert.level,
      title: cert.career_title,
      progress: levelInfo.progress,
      progressRatio: levelInfo.progressRatio,
      xpRemaining: levelInfo.xpRemaining,
      currentLevelMinXp: levelInfo.currentLevelMinXp,
      nextLevelMinXp: levelInfo.nextLevelMinXp,
    },
    totalXp: cert.total_xp,
    lessonsCompleted: cert.lessons_completed,
    modulesCompleted: cert.modules_completed,
    issuedAt: cert.issued_at,
    isValid: true,
    verificationUrl: `${origin}/verify/${encodeURIComponent(cert.certificate_code)}`,
    portfolioUrl: `${origin}/p/${encodeURIComponent(username)}`,
  }
}

/**
 * Retrieves all certificates issued for a user.
 */
export async function getUserCertificates(
  supabase: SupabaseClient<Database>,
  userId: string
): Promise<CertificateRow[]> {
  const { data, error } = await supabase
    .from('certificates')
    .select('*')
    .eq('user_id', userId)
    .order('issued_at', { ascending: false })

  if (error) {
    console.error('[certificates-db] Error fetching user certificates:', error)
    return []
  }

  return data || []
}
