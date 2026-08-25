import { NextRequest, NextResponse } from 'next/server'
import { requireAdminUser, logAdminAction } from '@/lib/admin/guard'
import { createServiceRoleClient } from '@/lib/supabase'
import { renderEmailTemplate } from '@/emails'
import { logSystemError } from '@/lib/monitoring/logger'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAdminUser(request)
    if (!authResult.authorized || !authResult.userId) {
      return NextResponse.json(
        { error: authResult.error || 'Unauthorized' },
        { status: authResult.statusCode || 403 }
      )
    }

    const adminUser = { id: authResult.userId, email: authResult.email || 'admin@prodily.me' }
    const body = await request.json()
    const { targetUserId, templateKey, customVariables } = body

    if (!targetUserId || !templateKey) {
      return NextResponse.json({ error: 'targetUserId and templateKey are required' }, { status: 400 })
    }

    // Specific validation for direct custom messages
    if (templateKey === 'admin.direct_message') {
      const subject = customVariables?.subject
      const messageBody = customVariables?.messageBody
      if (!subject || typeof subject !== 'string' || !subject.trim()) {
        return NextResponse.json({ error: 'Subject is required for custom direct message' }, { status: 400 })
      }
      if (!messageBody || typeof messageBody !== 'string' || !messageBody.trim()) {
        return NextResponse.json({ error: 'Message body is required for custom direct message' }, { status: 400 })
      }
    }

    const supabase = createServiceRoleClient()

    // 1. Fetch Target Learner Account (Auth + public.users)
    const { data: userRow } = await supabase
      .from('users')
      .select('id, email, name')
      .eq('id', targetUserId)
      .maybeSingle()

    interface AuthUserRecord {
      email?: string
      email_confirmed_at?: string | null
      user_metadata?: { full_name?: string }
    }

    let authUser: AuthUserRecord | null = null
    try {
      const { data: authData } = await supabase.auth.admin.getUserById(targetUserId)
      if (authData?.user) authUser = authData.user as unknown as AuthUserRecord
    } catch {
      // Fallback
    }

    if (!userRow && !authUser) {
      void logSystemError({
        severity: 'error',
        category: 'resend',
        operation: 'admin_production_send_user_not_found',
        message: `Target user account not found for ID: ${targetUserId}`,
        details: { targetUserId, templateKey },
      })
      return NextResponse.json({ error: 'Target user account not found' }, { status: 404 })
    }

    const pubRow = userRow as unknown as { id: string; email: string; name?: string | null } | null
    const targetAuthUser = authUser as AuthUserRecord | null
    const recipientEmail = pubRow?.email || targetAuthUser?.email || ''
    const recipientName = pubRow?.name || targetAuthUser?.user_metadata?.full_name || recipientEmail.split('@')[0] || 'Learner'
    const isCriticalAuth = templateKey === 'auth.verify_email' || templateKey === 'auth.password_reset'

    // 2. Pre-Send Diagnostic & Quota Validation
    if (!isCriticalAuth && templateKey !== 'admin.direct_message') {
      const { data: globalPauseFlag } = await supabase
        .from('system_settings')
        .select('value')
        .eq('key', 'email_global_pause')
        .maybeSingle()

      const pauseRow = globalPauseFlag as unknown as { value?: unknown } | null
      if (pauseRow && (pauseRow.value === true || pauseRow.value === 'true')) {
        return NextResponse.json(
          { error: 'Global Email Delivery Pause is currently active. Non-critical production emails are paused.' },
          { status: 400 }
        )
      }
    }

    let customVerificationUrl: string | undefined

    // 3. Execution Path: Generate link for auth.verify_email
    if (templateKey === 'auth.verify_email') {
      const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') || 'https://prodily.adityagangwani.me'

      const linkRes = await supabase.auth.admin.generateLink({
        type: 'magiclink',
        email: recipientEmail,
        options: {
          redirectTo: `${siteUrl}/verified`,
        },
      })

      if (linkRes.data?.properties?.action_link) {
        customVerificationUrl = linkRes.data.properties.action_link
      } else {
        const linkError = linkRes.error?.message || 'Failed to generate verification link'
        void logSystemError({
          severity: 'error',
          category: 'verification',
          operation: 'admin_generate_verification_link',
          message: linkError,
          userId: targetUserId,
        })
        return NextResponse.json({ error: `Could not generate verification link: ${linkError}` }, { status: 400 })
      }
    }

    // 4. Production Email Queue Enqueue & Immediate Resend Dispatch Flow
    const templateVars: Record<string, unknown> = {
      userName: recipientName,
      appUrl: process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') || 'https://prodily.adityagangwani.me',
      ...(customVerificationUrl ? { verificationUrl: customVerificationUrl } : {}),
      ...customVariables,
    }

    // Render template check
    try {
      await renderEmailTemplate(templateKey, templateVars)
    } catch (renderErr) {
      const renderMsg = renderErr instanceof Error ? renderErr.message : 'Render failure'
      void logSystemError({
        severity: 'error',
        category: 'system',
        operation: 'admin_production_render',
        message: renderMsg,
        templateKey,
      })
      return NextResponse.json({ error: `Template render validation failed: ${renderMsg}` }, { status: 400 })
    }

    const { enqueueNotificationItem, processEmailQueue } = await import('@/lib/notifications/queue/processor')
    const enqueueRes = await enqueueNotificationItem({
      userId: targetUserId,
      toEmail: recipientEmail,
      toName: recipientName,
      channel: 'email',
      templateKey,
      templateVariables: templateVars,
      eventId: `admin-prod-${Date.now()}-${targetUserId}`,
      eventType: 'admin.manual_trigger',
      category: 'learning',
      priorityLevel: 'high',
    })

    if (!enqueueRes.success || !enqueueRes.queueId) {
      return NextResponse.json({
        success: false,
        error: enqueueRes.reason || 'Failed to enqueue production email for user.',
      }, { status: 400 })
    }

    const queueId = enqueueRes.queueId

    // Immediate queue processing trigger
    const processResult = await processEmailQueue(50)

    // Inspect the specific queue row status to verify real delivery status
    const { data: queueItem } = await supabase
      .from('email_queue')
      .select('id, status, error_message, resend_id, attempt_count')
      .eq('id', queueId)
      .maybeSingle()

    const queueStatus = (queueItem as { status?: string; error_message?: string; resend_id?: string } | null)?.status || 'delivered'
    const queueError = (queueItem as { error_message?: string } | null)?.error_message
    const resendId = (queueItem as { resend_id?: string } | null)?.resend_id

    if (queueStatus === 'failed') {
      return NextResponse.json({
        success: false,
        error: `Production email dispatch failed: ${queueError || 'Provider delivery error'}`,
        queueId,
        status: queueStatus,
        processResult,
      }, { status: 400 })
    }

    await logAdminAction(
      adminUser.id,
      adminUser.email,
      'SEND_PRODUCTION_EMAIL',
      'email_queue',
      queueId,
      {
        recipientEmail,
        templateKey,
        queueId,
        status: queueStatus,
        resendId,
        processResult,
      }
    )

    return NextResponse.json({
      success: true,
      message: `Production email (${templateKey}) successfully dispatched to ${recipientEmail}.`,
      queueId,
      status: queueStatus,
      resendId: resendId || null,
      processResult,
    })
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown server error'
    void logSystemError({
      severity: 'error',
      category: 'system',
      operation: 'admin_production_send_exception',
      message: errorMsg,
    })
    return NextResponse.json({ error: 'Internal server error while dispatching production email.' }, { status: 500 })
  }
}
