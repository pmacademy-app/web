/**
 * Certificate Database Operations Service (Phase 3 Sprint 3)
 *
 * Handles server-side queries for certificate generation, issuance, and verification.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase'
import { calculateLevel, type LevelInfo } from '@/lib/xp'
import { generateCertificateCode } from '@/lib/certificates'

type CertificateRow = Database['public']['Tables']['certificates']['Row']
type UserRow = Database['public']['Tables']['users']['Row']

interface DBChain {
  [method: string]: (...args: unknown[]) => DBChain & Promise<{ data: unknown; error: unknown }>
}

export interface VerifiedCertificatePayload {
  id: string
  certificateCode: string
  type: string
  moduleSlug: string | null
  learnerName: string
  username: string
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
 */
export async function issueCertificate(
  supabase: SupabaseClient<Database>,
  userId: string,
  type: string = 'full_curriculum',
  moduleSlug: string | null = null
): Promise<CertificateRow> {
  // 1. Fetch user state
  const { data: user, error: userError } = (await (supabase
    .from('users') as unknown as DBChain)
    .select('*')
    .eq('id', userId)
    .single()) as unknown as { data: UserRow | null; error: unknown }

  if (userError || !user) {
    throw new Error('User profile not found.')
  }

  // 2. Fetch total completed lessons count
  const { data: progressRows } = (await (supabase
    .from('user_lesson_progress') as unknown as DBChain)
    .select('lesson_id')
    .eq('user_id', userId)
    .eq('status', 'completed')) as unknown as { data: { lesson_id: string }[] | null }

  const lessonsCompleted = progressRows?.length ?? 0
  const modulesCompleted = Math.min(9, Math.floor(lessonsCompleted / 10))
  const levelInfo = calculateLevel(user.total_xp || 0)

  const certCode = generateCertificateCode(userId, type, moduleSlug)

  // 3. Check if certificate already exists
  const { data: existing } = (await (supabase
    .from('certificates') as unknown as DBChain)
    .select('*')
    .eq('certificate_code', certCode)
    .maybeSingle()) as unknown as { data: CertificateRow | null }

  if (existing) {
    return existing
  }

  // 4. Insert new certificate
  const newCert = {
    user_id: userId,
    certificate_code: certCode,
    type,
    module_slug: moduleSlug,
    learner_name: user.name || user.username || 'PM Academy Learner',
    level: levelInfo.level,
    career_title: levelInfo.title,
    total_xp: user.total_xp || 0,
    lessons_completed: lessonsCompleted,
    modules_completed: modulesCompleted,
    issued_at: new Date().toISOString(),
  }

  const { data: inserted, error: insertError } = (await (supabase
    .from('certificates') as unknown as DBChain)
    .insert(newCert)
    .select('*')
    .single()) as unknown as { data: CertificateRow | null; error: unknown }

  if (insertError || !inserted) {
    console.error('[certificates-db] Error inserting certificate:', insertError)
    throw new Error('Failed to issue certificate.')
  }

  return inserted
}

/**
 * Verifies a certificate by code or ID for public verification page.
 */
export async function verifyCertificate(
  supabase: SupabaseClient<Database>,
  codeOrId: string,
  siteOrigin: string = 'https://pmacademy.com'
): Promise<VerifiedCertificatePayload | null> {
  const cleanCode = codeOrId.trim()

  // 1. Query certificate by code or id
  let { data: cert } = (await (supabase
    .from('certificates') as unknown as DBChain)
    .select('*')
    .ilike('certificate_code', cleanCode)
    .maybeSingle()) as unknown as { data: CertificateRow | null }

  if (!cert) {
    const { data: certById } = (await (supabase
      .from('certificates') as unknown as DBChain)
      .select('*')
      .eq('id', cleanCode)
      .maybeSingle()) as unknown as { data: CertificateRow | null }

    cert = certById
  }

  if (!cert) {
    return null
  }

  // 2. Fetch associated user profile for username
  const { data: user } = (await (supabase
    .from('users') as unknown as DBChain)
    .select('username, name')
    .eq('id', cert.user_id)
    .single()) as unknown as { data: { username: string | null; name: string | null } | null }

  const username = user?.username || `user_${cert.user_id.substring(0, 8)}`
  const learnerName = user?.name || cert.learner_name
  const levelInfo = calculateLevel(cert.total_xp)

  const origin = siteOrigin.replace(/\/$/, '')

  return {
    id: cert.id,
    certificateCode: cert.certificate_code,
    type: cert.type,
    moduleSlug: cert.module_slug,
    learnerName,
    username,
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
  const { data, error } = (await (supabase
    .from('certificates') as unknown as DBChain)
    .select('*')
    .eq('user_id', userId)
    .order('issued_at', { ascending: false })) as unknown as { data: CertificateRow[] | null; error: unknown }

  if (error) {
    console.error('[certificates-db] Error fetching user certificates:', error)
    return []
  }

  return data || []
}
