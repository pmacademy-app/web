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

    // Inspect the specific queue row to verify REAL delivery status.
    const { data: queueItem, error: queueReadErr } = await supabase
      .from('email_queue')
      .select('id, status, error_message, resend_id, attempt_count')
      .eq('id', queueId)
      .maybeSingle()

    const typedItem = queueItem as { status?: string; error_message?: string; resend_id?: string } | null
    const queueError = typedItem?.error_message
    const resendId = typedItem?.resend_id

    // The row is the only evidence of what happened. If it cannot be read, we do not
    // know the outcome — previously this defaulted to 'delivered', reporting success
    // for a send whose result was never observed.
    if (queueReadErr || !typedItem?.status) {
      return NextResponse.json({
        success: false,
        error: `Email was queued but its delivery status could not be confirmed${queueReadErr ? `: ${queueReadErr.message}` : '.'}`,
        queueId,
        status: 'unknown',
        processResult,
      }, { status: 500 })
    }

    const queueStatus = typedItem.status

    // Only 'delivered' means a provider accepted the message. The processor writes
    // 'retrying' or 'dead_letter' on failure and 'skipped'/'suppressed' on policy
    // stops — it never writes 'failed' (only the bounce webhook does), so the previous
    // `queueStatus === 'failed'` check matched nothing and every failure was reported
    // to the admin, and recorded in the audit log, as a successful dispatch.
    if (queueStatus !== 'delivered') {
      const isPolicyStop = queueStatus === 'skipped' || queueStatus === 'suppressed'
      const reason = isPolicyStop
        ? `Email was not sent — ${queueStatus} (${queueError || 'blocked by suppression or automation policy'})`
        : `Production email dispatch failed: ${queueError || `Provider delivery error (queue status: ${queueStatus})`}`

      await logAdminAction(
        adminUser.id,
        adminUser.email,
        'SEND_PRODUCTION_EMAIL_FAILED',
        'email_queue',
        queueId,
        { recipientEmail, templateKey, queueId, status: queueStatus, error: queueError, processResult }
      )

      return NextResponse.json({
        success: false,
        error: reason,
        queueId,
        status: queueStatus,
        processResult,
        // 400 preserves the established contract for a delivery failure; a policy stop
        // (suppressed recipient / paused automation) is a distinct, previously
        // unhandled outcome and gets its own conflict code.
      }, { status: isPolicyStop ? 409 : 400 })
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
