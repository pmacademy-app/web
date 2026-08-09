import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'
import { getAuthenticatedUserFromRequest } from '@/lib/auth'
import { issueCertificate, getUserCertificates } from '@/lib/certificates-db'
import { initializeNotificationConnectors } from '@/lib/notifications/events/connectors'
import { globalNotificationDispatcher } from '@/lib/notifications/dispatcher'
import { BRAND } from '@/lib/brand'

export async function GET(request: Request) {
  try {
    const user = await getAuthenticatedUserFromRequest(request)

    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized. Authenticated session required.' },
        { status: 401 }
      )
    }

    const supabase = createServerSupabaseClient()
    const certificates = await getUserCertificates(supabase, user.id)
    return NextResponse.json({ success: true, certificates })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to fetch certificates.'
    console.error('[API GET /api/certificates] Error:', error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const user = await getAuthenticatedUserFromRequest(request)

    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized. Authenticated session required.' },
        { status: 401 }
      )
    }

    const supabase = createServerSupabaseClient()
    const body = await request.json().catch(() => ({}))
    const type = body.type || 'full_curriculum'
    const moduleSlug = body.moduleSlug || null

    const certificate = await issueCertificate(supabase, user.id, type, moduleSlug)

    // Dispatch certificate.generated event → in-app notification (primary channel) + email queue
    try {
      initializeNotificationConnectors()
      const siteOrigin = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') || BRAND.siteUrl
      await globalNotificationDispatcher.dispatch({
        id: `cert-event-${Date.now()}`,
        event: 'certificate.generated',
        userId: user.id,
        userEmail: user.email || '',
        userName: user.user_metadata?.full_name || user.email?.split('@')[0] || 'Learner',
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
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to issue certificate.'
    console.error('[API POST /api/certificates] Error:', error)
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
