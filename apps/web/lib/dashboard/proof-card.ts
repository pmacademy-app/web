/**
 * Pure state derivation for the dashboard "Portfolio & Proof" card.
 *
 * Framework-agnostic and side-effect free so it can be unit-tested without a DOM
 * and imported from client components without pulling in any server module.
 */
import { CURRICULUM_LESSON_COUNT } from '@/lib/curriculum-registry'


/**
 * Lessons required for the full-curriculum certificate: the same registry count the issuance
 * rule in `lib/certificates-db.ts` uses.
 */
export const FULL_CURRICULUM_LESSON_COUNT = CURRICULUM_LESSON_COUNT

export type PortfolioState = 'public' | 'private' | 'none'

/**
 * Resolves which portfolio state the learner is in.
 * - `none`: no username, or one that is blank after trimming.
 * - `public`: a username and the portfolio is published.
 * - `private`: a username but the portfolio is not published.
 */
export function derivePortfolioState(
  username: string | null | undefined,
  isPortfolioPublic: boolean,
): PortfolioState {
  const trimmed = typeof username === 'string' ? username.trim() : ''
  if (!trimmed) return 'none'
  return isPortfolioPublic ? 'public' : 'private'
}

/**
 * Clamps a completed-lesson count into `[0, FULL_CURRICULUM_LESSON_COUNT]`.
 * Fractions round down; NaN becomes 0; +/-Infinity clamps to the nearest bound.
 */
export function clampCertificateProgress(completedLessons: number): number {
  if (Number.isNaN(completedLessons)) return 0
  const whole = Math.floor(completedLessons)
  return Math.min(FULL_CURRICULUM_LESSON_COUNT, Math.max(0, whole))
}

export type CertificateState = 'earned' | 'ready' | 'in_progress' | 'not_started'

/**
 * Resolves the certificate half of the card.
 * - `earned`: a full-curriculum certificate row exists (wins over any lesson count).
 * - `ready`: all lessons are done but no row exists yet. Certificates are issued lazily
 *   on `/progress/certificates`, so the dashboard points there and never issues one.
 * - `not_started`: zero lessons completed.
 * - `in_progress`: anything in between.
 */
export function deriveCertificateState(
  hasCertificate: boolean,
  completedLessons: number,
): CertificateState {
  if (hasCertificate) return 'earned'
  const done = clampCertificateProgress(completedLessons)
  if (done >= FULL_CURRICULUM_LESSON_COUNT) return 'ready'
  if (done === 0) return 'not_started'
  return 'in_progress'
}

/**
 * Reads the result of the dashboard's lean `certificates` existence query. Any error,
 * missing result, or empty result counts as "no certificate yet".
 */
export function hasFullCurriculumCertificate(
  result: { data?: unknown[] | null; error?: unknown } | null | undefined,
): boolean {
  if (!result || result.error) return false
  return Array.isArray(result.data) && result.data.length > 0
}
