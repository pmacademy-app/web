import { NextResponse } from 'next/server'
import { logAdminAction } from '@/lib/admin/guard'
import { requireAdmin } from '@/lib/api/actor'
import { withRoute } from '@/lib/api/with-route'
import { adminErrorMessage } from '@/lib/errors/api-response'
import { createServiceRoleClient } from '@/lib/supabase'
import { issueCertificate } from '@/lib/certificates-db'
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

    // 2. Issue Test Certificate (reuses production certificate service with admin dev bypass)
    const certRow = await issueCertificate(supabase, targetUserId, type, moduleSlug, { bypassPrerequisites: true })

    // Override / mark certificate as DEV TEST certificate
    const testCertCode = `TEST-${certRow.certificate_code}`
    
    // Update inserted certificate row with test indicator using typed chain
    type DBUpdateChain = { update: (data: Record<string, unknown>) => { eq: (col: string, val: string) => Promise<{ error: unknown }> } }
    await (supabase.from('certificates') as unknown as DBUpdateChain)
      .update({
        certificate_code: testCertCode,
        career_title: `[TEST] ${certRow.career_title}`,
      })
      .eq('id', certRow.id)

    const siteOrigin = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') || BRAND.siteUrl
    const verificationUrl = `${siteOrigin}/verify/${encodeURIComponent(testCertCode)}`

    // 3. Trigger Notification Event (reuses production event & email queue pipeline)
    initializeNotificationConnectors()
    await globalNotificationDispatcher.dispatch({
      id: `dev-cert-event-${Date.now()}`,
      event: 'certificate.generated',
      userId: targetUserId,
      userEmail: typedUser.email,
      userName: typedUser.name || typedUser.username || 'Learner',
      userTimezone: 'UTC',
      priority: 'high',
      category: 'certificates',
      occurredAt: new Date().toISOString(),
      payload: {
        certificateCode: testCertCode,
        certificateType: type,
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
    const message = adminErrorMessage(err, 'Failed to generate test certificate')
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
  }
)
