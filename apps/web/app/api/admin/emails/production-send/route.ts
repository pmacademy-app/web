import { NextRequest, NextResponse } from 'next/server'
import { requireAdminUser, logAdminAction } from '@/lib/admin/guard'
import { createServerSupabaseClient } from '@/lib/supabase'
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

    const supabase = createServerSupabaseClient()

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
      const { logSystemError } = await import('@/lib/monitoring/logger')
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
    if (!isCriticalAuth) {
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

    // 3. Execution Path: Critical Auth Verification vs Optional Queue Processing
    if (templateKey === 'auth.verify_email') {
      // Canonical Supabase Auth Resend Flow
      const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') || 'https://prodily.adityagangwani.me'
      const { error: resendErr } = await supabase.auth.resend({
        type: 'signup',
        email: recipientEmail,
        options: {
          emailRedirectTo: `${siteUrl}/verified`,
        },
      })

      if (resendErr) {
        void logSystemError({
          severity: 'error',
          category: 'resend',
          operation: 'admin_resend_verification',
          message: resendErr.message,
          userId: targetUserId,
        })
        return NextResponse.json({ error: `Verification resend failed: ${resendErr.message}` }, { status: 400 })
      }

      await logAdminAction(
        adminUser.id,
        adminUser.email,
        'SEND_PRODUCTION_EMAIL',
        'email_queue',
        targetUserId,
        {
          recipientEmail,
          templateKey,
          isCriticalAuth: true,
          mode: 'canonical_auth_resend',
        }
      )

      return NextResponse.json({
        success: true,
        message: `Canonical production verification email successfully dispatched to ${recipientEmail}.`,
        mode: 'canonical_auth_resend',
      })
    }

    // Optional / Milestone Email Enqueue Flow
    const templateVars: Record<string, unknown> = {
      userName: recipientName,
      appUrl: process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') || 'https://prodily.adityagangwani.me',
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

    const queueId = typeof enqueueRes === 'string' ? enqueueRes : (enqueueRes as { queueId?: string })?.queueId || 'unknown'

    // Immediate queue processing trigger
    const processResult = await processEmailQueue(50)

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
        processResult,
      }
    )

    return NextResponse.json({
      success: true,
      message: `Production email successfully enqueued and processed for ${recipientEmail}.`,
      queueId,
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
