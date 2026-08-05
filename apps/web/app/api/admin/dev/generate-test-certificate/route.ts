import { NextResponse } from 'next/server'
import { requireAdminUser, logAdminAction } from '@/lib/admin/guard'
import { createServerSupabaseClient } from '@/lib/supabase'
import { issueCertificate } from '@/lib/certificates-db'
import { globalNotificationDispatcher } from '@/lib/notifications/dispatcher'

export async function POST(request: Request) {
  // 1. Enforce RBAC
  const authGuard = await requireAdminUser(request)
  if (!authGuard.authorized) {
    return NextResponse.json({ error: authGuard.error }, { status: authGuard.statusCode || 403 })
  }

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

    const supabase = createServerSupabaseClient()

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

    // 2. Issue Test Certificate (reuses production certificate service)
    const certRow = await issueCertificate(supabase, targetUserId, type, moduleSlug)

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

    const siteOrigin = process.env.NEXT_PUBLIC_APP_URL || 'https://pmacademy.com'
    const verificationUrl = `${siteOrigin}/verify/${encodeURIComponent(testCertCode)}`

    // 3. Trigger Notification Event (reuses production event & email queue pipeline)
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
      authGuard.userId!,
      authGuard.email!,
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
    const message = err instanceof Error ? err.message : 'Failed to generate test certificate'
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
