import { NextResponse } from 'next/server'
import { logAdminAction } from '@/lib/admin/guard'
import { requireAdmin } from '@/lib/api/actor'
import { withRoute } from '@/lib/api/with-route'
import { adminErrorMessage } from '@/lib/errors/api-response'
import { createServiceRoleClient } from '@/lib/supabase'
import { issueTestCertificate } from '@/lib/certificates-db'
import { PublicError } from '@/lib/errors/public-error'
import { globalNotificationDispatcher } from '@/lib/notifications/dispatcher'
import { initializeNotificationConnectors } from '@/lib/notifications/events/connectors'
import { BRAND } from '@/lib/brand'

export const POST = withRoute(
  {
    actor: { allow: ['admin'] },
    operation: 'admin.dev.generate_test_certificate.post',
    domain: 'admin',
    summary: 'Unexpected failure in POST /api/admin/dev/generate-test-certificate',
  },
  async ({ request, actor }) => {
  // 1. RBAC is enforced by the actor policy above.
  const authGuard = requireAdmin(actor)

  try {
    const body = await request.json()
    const { targetUserId, type = 'full_curriculum', moduleSlug = null } = body as {
      targetUserId: string
      type?: string
      moduleSlug?: string | null
    }

    if (!targetUserId) {
      return NextResponse.json({ error: 'Missing targetUserId' }, { status: 400 })
    }

    const supabase = createServiceRoleClient()

    // Fetch target user profile
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id, email, name, username')
      .eq('id', targetUserId)
      .single()

    if (userError || !user) {
      return NextResponse.json({ error: 'Target user not found' }, { status: 404 })
    }

    const typedUser = user as unknown as { id: string; email: string; name?: string; username?: string }

    // 2. Insert a fresh TEST certificate. Never routed through the learner issuance flow
    // and never updates an existing row: the learner's real certificate (any year) stays
    // untouched, and every run gets its own unique TEST- code (and so its own email).
    const certRow = await issueTestCertificate(supabase, targetUserId, type, moduleSlug)
    const testCertCode = certRow.certificate_code

    const siteOrigin = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') || BRAND.siteUrl
    const verificationUrl = `${siteOrigin}/verify/${encodeURIComponent(testCertCode)}`

    // 3. Trigger Notification Event (reuses production event & email queue pipeline).
    // Delivered to the admin who ran the test, never to the learner: admin test data must
    // not reach a learner's inbox or bell (Growth R5 P3). The certificate row still belongs
    // to the learner so its verify page can be checked.
    initializeNotificationConnectors()
    await globalNotificationDispatcher.dispatch({
      id: `dev-cert-event-${Date.now()}`,
      event: 'certificate.generated',
      userId: authGuard.userId,
      userEmail: authGuard.email,
      userName: 'Admin (test delivery)',
      userTimezone: 'UTC',
      priority: 'high',
      category: 'certificates',
      occurredAt: new Date().toISOString(),
      payload: {
        certificateCode: testCertCode,
        certificateType: certRow.type,
        learnerName: typedUser.name || typedUser.username || 'Learner',
        verificationUrl,
        isTestCertificate: true,
        generatedByAdminId: authGuard.userId,
      },
      metadata: {
        sourceRoute: '/api/admin/dev/generate-test-certificate',
        correlationId: `dev-cert-${Date.now()}`,
      },
    })

    // 4. Record Audit Log
    await logAdminAction(
      authGuard.userId,
      authGuard.email,
      'generate_test_certificate',
      'certificate',
      certRow.id,
      {
        targetUserId,
        targetUserEmail: typedUser.email,
        certificateCode: testCertCode,
        reason: 'Development Testing',
      }
    )

    return NextResponse.json({
      success: true,
      certificateId: certRow.id,
      certificateCode: testCertCode,
      verificationUrl,
      targetUserId,
      isTestCertificate: true,
    })
  } catch (err) {
    if (err instanceof PublicError) {
      return NextResponse.json({ success: false, error: err.message, code: err.code }, { status: err.status })
    }
    const message = adminErrorMessage(err, 'Failed to generate test certificate')
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
  }
)
