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
import { TEST_CERTIFICATE_PREFIX, generateCertificateCode, isTestCertificateCode } from '@/lib/certificates'
import { CURRICULUM_LESSON_COUNT, getLessonIdsForModule } from '@/lib/curriculum-registry'
import { PublicError } from '@/lib/errors/public-error'
import { trackProductEvent } from '@/lib/events/product-events'

// Defined in the client-safe module so UI can ask without importing this data layer.
export { TEST_CERTIFICATE_PREFIX, isTestCertificateCode }

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

export interface IssueCertificateResult {
  certificate: CertificateRow
  /** True only when this call inserted the row; false when it already existed. */
  created: boolean
}

type CertificateInsert = Database['public']['Tables']['certificates']['Insert']
type UserRow = Database['public']['Tables']['users']['Row']

/** Postgres unique_violation. */
const UNIQUE_VIOLATION = '23505'

/** Lessons required for the full-curriculum certificate. */
export const FULL_CURRICULUM_LESSON_COUNT = CURRICULUM_LESSON_COUNT

function normalizeCertificateType(type: string): string {
  return type === 'module' ? 'module_completion' : type
}

/** The full-curriculum certificate has no module; for modules '' means "none". */
function normalizeModuleSlug(normalizedType: string, moduleSlug: string | null | undefined): string | null {
  if (normalizedType === 'full_curriculum') return null
  return moduleSlug || null
}

interface IssuanceContext {
  user: UserRow
  completedLessonIds: Set<string>
}

async function loadIssuanceContext(
  supabase: SupabaseClient<Database>,
  userId: string
): Promise<IssuanceContext> {
  const { data: user, error: userError } = await supabase
    .from('users')
    .select('*')
    .eq('id', userId)
    .single()

  if (userError || !user) {
    throw new PublicError('User profile not found.', { status: 404, code: 'NOT_FOUND' })
  }

  const { data: progressRows, error: progressError } = await supabase
    .from('user_lesson_progress')
    .select('lesson_id')
    .eq('user_id', userId)
    .eq('status', 'completed')

  // A failed read is not "0 lessons": that would report a graduate as not eligible.
  if (progressError) {
    console.error('[certificates-db] Lesson progress lookup failed:', progressError)
    throw new Error('Lesson progress lookup failed.')
  }

  return { user, completedLessonIds: new Set((progressRows || []).map((p) => p.lesson_id)) }
}

/** The certificate row as issued today: a snapshot of the learner's progress and level. */
function buildCertificateInsert(
  context: IssuanceContext,
  userId: string,
  certificateCode: string,
  normalizedType: string,
  moduleSlug: string | null
): CertificateInsert {
  const { user, completedLessonIds } = context
  const lessonsCompleted = completedLessonIds.size
  const levelInfo = calculateLevel(user.total_xp || 0)

  return {
    user_id: userId,
    certificate_code: certificateCode,
    type: normalizedType,
    module_slug: moduleSlug,
    learner_name: user.name || user.username || BRAND.learnerFallbackName,
    level: levelInfo.level,
    career_title: levelInfo.title,
    total_xp: user.total_xp || 0,
    lessons_completed: lessonsCompleted,
    modules_completed: Math.min(9, Math.floor(lessonsCompleted / 10)),
    issued_at: new Date().toISOString(),
  }
}

/**
 * Finds the learner's existing real certificate for (type, module).
 *
 * The code embeds the issue year, so the unique-code lookup alone misses a row minted
 * in an earlier year and a second certificate would be inserted. The fallback scans the
 * learner's own rows (at most one per module plus the full curriculum) and matches on
 * identity instead, ignoring admin TEST- rows.
 *
 * Precedence: a by-code hit for the current year is returned first, even when an older
 * matching row exists. Otherwise the fallback returns the learner's oldest matching
 * row — the one they have already shared.
 *
 * A failed lookup throws rather than reporting "none", because the caller would
 * otherwise insert a duplicate. A code owned by another learner throws
 * CERTIFICATE_CODE_COLLISION rather than ever returning someone else's certificate.
 */
async function findExistingCertificate(
  supabase: SupabaseClient<Database>,
  userId: string,
  normalizedType: string,
  moduleSlug: string | null,
  certCode: string
): Promise<CertificateRow | null> {
  const { data: byCode, error: byCodeError } = await supabase
    .from('certificates')
    .select('*')
    .eq('certificate_code', certCode)
    .maybeSingle()

  if (byCodeError) {
    console.error('[certificates-db] Certificate lookup by code failed:', byCodeError)
    throw new Error('Certificate lookup failed.')
  }

  if (byCode) {
    if (byCode.user_id !== userId) {
      console.error('[certificates-db] Certificate code collision across learners:', {
        certificateCode: certCode,
        requestingUserId: userId,
      })
      throw new PublicError('This certificate could not be issued. Please contact support.', {
        status: 409,
        code: 'CERTIFICATE_CODE_COLLISION',
      })
    }
    return byCode
  }

  const { data: userRows, error: userRowsError } = await supabase
    .from('certificates')
    .select('*')
    .eq('user_id', userId)

  if (userRowsError) {
    console.error('[certificates-db] Certificate lookup by learner failed:', userRowsError)
    throw new Error('Certificate lookup failed.')
  }

  const matches = (Array.isArray(userRows) ? userRows : [])
    .filter(
      (row) =>
        row.user_id === userId &&
        row.type === normalizedType &&
        (normalizedType === 'full_curriculum' || (row.module_slug || null) === moduleSlug) &&
        !isTestCertificateCode(row.certificate_code)
    )
    .sort((a, b) => (a.issued_at < b.issued_at ? -1 : a.issued_at > b.issued_at ? 1 : 0))

  return matches[0] ?? null
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
  const { certificate } = await issueCertificateWithStatus(supabase, userId, type, moduleSlug, options)
  return certificate
}

/**
 * Same as `issueCertificate`, but also reports whether this call created the row, so
 * callers can announce a certificate exactly once.
 *
 * Idempotent per (user, type, module): an existing real certificate is returned with
 * `created: false`, including one whose code was minted in an earlier year, and a
 * concurrent insert that loses the unique-code race resolves to the winner's row
 * rather than failing.
 */
export async function issueCertificateWithStatus(
  supabase: SupabaseClient<Database>,
  userId: string,
  type: string = 'full_curriculum',
  moduleSlug: string | null = null,
  options?: IssueCertificateOptions
): Promise<IssueCertificateResult> {
  const normalizedType = normalizeCertificateType(type)
  const normalizedSlug = normalizeModuleSlug(normalizedType, moduleSlug)

  // 1-2. Fetch user state and completed lessons
  const context = await loadIssuanceContext(supabase, userId)
  const { completedLessonIds } = context
  const lessonsCompleted = completedLessonIds.size

  // 3. Prerequisite validation (enforced unless explicit bypass provided)
  if (!options?.bypassPrerequisites) {
    if (normalizedType === 'full_curriculum') {
      if (lessonsCompleted < FULL_CURRICULUM_LESSON_COUNT) {
        throw new PublicError(
          `Full curriculum completion certificate requires completing all ${FULL_CURRICULUM_LESSON_COUNT} lessons (currently ${lessonsCompleted}/${FULL_CURRICULUM_LESSON_COUNT}).`,
          { status: 400, code: 'PREREQUISITES_NOT_MET' }
        )
      }
    } else if (normalizedType === 'module_completion') {
      if (!normalizedSlug) {
        throw new PublicError('Module slug is required for module certificate issuance.', {
          status: 400,
          code: 'INVALID_REQUEST',
        })
      }
      const requiredLessonIds = getLessonIdsForModule(normalizedSlug)
      if (requiredLessonIds.length === 0) {
        throw new PublicError(`Invalid or unrecognized module slug: "${normalizedSlug}".`, {
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

  const certCode = generateCertificateCode(userId, normalizedType, normalizedSlug)

  // 4. Check if certificate already exists (idempotent lookup)
  const existing = await findExistingCertificate(supabase, userId, normalizedType, normalizedSlug, certCode)

  if (existing) {
    return { certificate: existing, created: false }
  }

  // 5. Insert new certificate
  const newCert = buildCertificateInsert(context, userId, certCode, normalizedType, normalizedSlug)

  const { data: inserted, error: insertError } = await supabase
    .from('certificates')
    .insert(newCert)
    .select('*')
    .single()

  if (insertError?.code === UNIQUE_VIOLATION) {
    // A concurrent request committed the same certificate between our lookup and insert.
    // Throws on a cross-learner collision; never returns another learner's row.
    const winner = await findExistingCertificate(supabase, userId, normalizedType, normalizedSlug, certCode)
    if (winner) {
      return { certificate: winner, created: false }
    }
  }

  if (insertError || !inserted) {
    console.error('[certificates-db] Error inserting certificate:', insertError)
    throw new PublicError('Failed to issue certificate.', { status: 400, code: 'ISSUE_FAILED' })
  }

  await trackProductEvent('certificate_issued', userId, {
    certificate_id: inserted.id,
    certificate_code: inserted.certificate_code,
    type: inserted.type,
    module_slug: inserted.module_slug,
  })

  return { certificate: inserted, created: true }
}

/**
 * A unique admin dev test code: `TEST-PMA-YYYY-XXXXXXXX-XXXXXX`.
 *
 * The random suffix makes every dev run its own row (and its own email idempotency
 * key), and the prefix keeps it out of every real-certificate lookup.
 */
export function buildTestCertificateCode(
  userId: string,
  type: string = 'full_curriculum',
  moduleSlug: string | null = null
): string {
  const normalizedType = normalizeCertificateType(type)
  const baseCode = generateCertificateCode(userId, normalizedType, normalizeModuleSlug(normalizedType, moduleSlug))
  const suffix = globalThis.crypto.randomUUID().replace(/-/g, '').slice(0, 6).toUpperCase()
  return `${TEST_CERTIFICATE_PREFIX}${baseCode}-${suffix}`
}

/**
 * Inserts a fresh admin dev TEST certificate for any learner, bypassing prerequisites.
 *
 * Deliberately separate from `issueCertificateWithStatus`: it never looks up, returns
 * or modifies an existing row, so the dev tool cannot touch a learner's real
 * certificate.
 */
export async function issueTestCertificate(
  supabase: SupabaseClient<Database>,
  userId: string,
  type: string = 'full_curriculum',
  moduleSlug: string | null = null
): Promise<CertificateRow> {
  const normalizedType = normalizeCertificateType(type)
  if (normalizedType !== 'full_curriculum' && normalizedType !== 'module_completion') {
    throw new PublicError(`Invalid certificate type: "${type}". Must be "full_curriculum" or "module_completion".`, {
      status: 400,
      code: 'INVALID_REQUEST',
    })
  }
  const normalizedSlug = normalizeModuleSlug(normalizedType, moduleSlug)
  if (normalizedType === 'module_completion' && !normalizedSlug) {
    throw new PublicError('Module slug is required for module certificate issuance.', {
      status: 400,
      code: 'INVALID_REQUEST',
    })
  }

  const context = await loadIssuanceContext(supabase, userId)
  const testCode = buildTestCertificateCode(userId, normalizedType, normalizedSlug)
  const row = buildCertificateInsert(context, userId, testCode, normalizedType, normalizedSlug)

  const { data: inserted, error: insertError } = await supabase
    .from('certificates')
    .insert({ ...row, career_title: `[TEST] ${row.career_title}` })
    .select('*')
    .single()

  if (insertError || !inserted) {
    console.error('[certificates-db] Error inserting test certificate:', insertError)
    throw new PublicError('Failed to insert test certificate.', { status: 500, code: 'ISSUE_FAILED' })
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
