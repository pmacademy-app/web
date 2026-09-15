import { NextResponse } from 'next/server'

import { requireUserId } from '@/lib/api/actor'
import { withRoute } from '@/lib/api/with-route'
import { BRAND } from '@/lib/brand'
import { issueCertificate, getUserCertificates } from '@/lib/certificates-db'
import { getAuthenticatedUserFromRequest } from '@/lib/auth'
import { globalNotificationDispatcher } from '@/lib/notifications/dispatcher'
import { initializeNotificationConnectors } from '@/lib/notifications/events/connectors'
import { createServiceRoleClient } from '@/lib/supabase'

export const GET = withRoute(
  {
    actor: { allow: ['learner'] },
    operation: 'certificates.read',
    summary: 'Unexpected failure fetching learner certificates',
  },
  async ({ actor }) => {
    const supabase = createServiceRoleClient()
    const certificates = await getUserCertificates(supabase, requireUserId(actor))

    return NextResponse.json({ success: true, certificates })
  }
)

export const POST = withRoute(
  {
    actor: { allow: ['learner'] },
    operation: 'certificates.issue',
    summary: 'Unexpected failure issuing a certificate',
  },
  async ({ request, actor }) => {
    const userId = requireUserId(actor)
    const supabase = createServiceRoleClient()

    // Read here rather than via a declared schema: the pre-migration route used
    // `request.json().catch(() => ({}))`, so an absent or malformed body fell back
    // to a full-curriculum certificate instead of returning 400.
    const body = (await request.json().catch(() => ({}))) as { type?: string; moduleSlug?: string | null }
    const type = body.type || 'full_curriculum'
    const moduleSlug = body.moduleSlug || null

    const certificate = await issueCertificate(supabase, userId, type, moduleSlug)

    // Dispatch certificate.generated event -> in-app notification (primary channel) + email queue
    try {
      initializeNotificationConnectors()
      // Re-read for profile metadata only — authorization is already settled by the
      // actor policy above. The call is memoized on this Request, so it is the same
      // resolution `resolveActor` performed and costs nothing.
      const user = await getAuthenticatedUserFromRequest(request)
      const siteOrigin = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') || BRAND.siteUrl
      await globalNotificationDispatcher.dispatch({
        id: `cert-event-${Date.now()}`,
        event: 'certificate.generated',
        userId,
        userEmail: user?.email || '',
        userName: user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'Learner',
        userTimezone: 'UTC',
        priority: 'high',
        category: 'certificates',
        occurredAt: new Date().toISOString(),
        payload: {
          certificateCode: certificate.certificate_code,
          certificateType: type,
          learnerName: certificate.learner_name,
          verificationUrl: `${siteOrigin}/verify/${encodeURIComponent(certificate.certificate_code)}`,
          issuedAt: certificate.issued_at,
        },
        metadata: { sourceRoute: '/api/certificates' },
      })
    } catch (err) {
      console.warn('[API:certificates] Notification dispatch failed:', err)
    }

    return NextResponse.json({ success: true, certificate })
  }
)
