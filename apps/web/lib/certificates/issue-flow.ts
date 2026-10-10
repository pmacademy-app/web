/**
 * Full-curriculum certificate issuance flow (server-only).
 *
 * Three paths can issue a full-curriculum certificate: the quiz submission that
 * completes the 90th lesson, the learner POST /api/certificates route, and the
 * certificates page repair for learners who finished before this flow existed. They
 * all go through here so the learner gets one row and one announcement.
 *
 * "Exactly once" is layered:
 * - `issueCertificateWithStatus` reports `created` only for the call that inserted.
 * - The event id is derived from the certificate code, so the in-app handler's
 *   idempotency key (the event id) dedupes a retried dispatch.
 * - The email connector keys the queue row on the code, so the email_queue unique
 *   index decides concurrent enqueues.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase'
import { BRAND } from '@/lib/brand'
import { issueCertificateWithStatus, type CertificateRow } from '@/lib/certificates-db'
import { PublicError } from '@/lib/errors/public-error'
import { globalNotificationDispatcher } from '@/lib/notifications/dispatcher'
import { initializeNotificationConnectors } from '@/lib/notifications/events/connectors'

// Defined in certificates-db (this module imports it, not the other way round).
export { FULL_CURRICULUM_LESSON_COUNT } from '@/lib/certificates-db'

export interface CertificateRecipientMeta {
  email?: string | null
  name?: string | null
}

export interface FullCurriculumIssueResult {
  certificate: CertificateRow | null
  created: boolean
}

/** Stable per-certificate event id: a retried dispatch is the same event. */
export function certificateGeneratedEventId(certificateCode: string): string {
  return `certificate-generated-${certificateCode}`
}

function resolveSiteOrigin(siteOrigin?: string): string {
  return (siteOrigin || process.env.NEXT_PUBLIC_SITE_URL || BRAND.siteUrl).replace(/\/$/, '')
}

/**
 * Announces an issued certificate (in-app notification + email queue).
 *
 * Fire-and-forget for the caller: never throws. Call it only for a certificate this
 * request created — the stable id and the email idempotency key are a backstop, not a
 * licence to dispatch on every read.
 *
 * Delivery is at-most-once: a handler that fails is logged, not retried.
 */
export async function dispatchCertificateGenerated(
  certificate: CertificateRow,
  meta: CertificateRecipientMeta,
  siteOrigin?: string
): Promise<void> {
  try {
    initializeNotificationConnectors()
    const origin = resolveSiteOrigin(siteOrigin)
    const code = certificate.certificate_code

    const { errors } = await globalNotificationDispatcher.dispatch({
      id: certificateGeneratedEventId(code),
      event: 'certificate.generated',
      userId: certificate.user_id,
      userEmail: meta.email || '',
      userName: meta.name || meta.email?.split('@')[0] || 'Learner',
      userTimezone: 'UTC',
      priority: 'high',
      category: 'certificates',
      occurredAt: new Date().toISOString(),
      payload: {
        certificateCode: code,
        certificateType: certificate.type,
        ...(certificate.module_slug ? { moduleSlug: certificate.module_slug } : {}),
        learnerName: certificate.learner_name,
        verificationUrl: `${origin}/verify/${encodeURIComponent(code)}`,
        issuedAt: certificate.issued_at,
      },
      metadata: { sourceRoute: 'certificates.issue-flow' },
    })

    // The dispatcher swallows handler failures and reports them; surface them here.
    if (errors.length > 0) {
      console.warn('[certificates/issue-flow] certificate.generated handlers failed:', {
        certificateCode: code,
        errors: errors.map(({ handlerId, error }) => ({ handlerId, message: error.message })),
      })
    }
  } catch (err) {
    console.warn('[certificates/issue-flow] certificate.generated dispatch failed:', err)
  }
}

/**
 * Issues the full-curriculum certificate when the learner has completed every lesson,
 * and announces it only when this call created it.
 *
 * Not eligible yet → `{ certificate: null, created: false }` (no throw). Already issued
 * → the existing row with `created: false` and no dispatch. Unexpected failures (e.g.
 * ISSUE_FAILED, missing profile) propagate; callers wrap this so they never break the
 * surrounding request.
 */
export async function issueFullCurriculumCertificateIfEligible(
  supabase: SupabaseClient<Database>,
  userId: string,
  meta: CertificateRecipientMeta
): Promise<FullCurriculumIssueResult> {
  let result
  try {
    result = await issueCertificateWithStatus(supabase, userId, 'full_curriculum', null)
  } catch (err) {
    if (err instanceof PublicError && err.code === 'PREREQUISITES_NOT_MET') {
      return { certificate: null, created: false }
    }
    throw err
  }

  if (result.created) {
    await dispatchCertificateGenerated(result.certificate, meta)
  }

  return result
}
