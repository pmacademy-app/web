import { NextRequest, NextResponse } from 'next/server'
import { requireAdminUser, logAdminAction } from '@/lib/admin/guard'
import { createServiceRoleClient } from '@/lib/supabase'
import { enqueueNotificationItem, processEmailQueue } from '@/lib/notifications/queue/processor'
import { createInAppNotification } from '@/lib/notifications/in-app/service'
import { logSystemError } from '@/lib/monitoring/logger'
import { revalidatePath } from 'next/cache'

export const runtime = 'nodejs'

interface BroadcastRecipient {
  id: string
  email: string
  name: string
}

export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAdminUser(request)
    if (!authResult.authorized || !authResult.userId) {
      return NextResponse.json(
        { error: authResult.error || 'Unauthorized' },
        { status: authResult.statusCode || 403 }
      )
    }

    const body = await request.json()
    const {
      audience = 'individual',
      targetUserId,
      cohortId,
      channel = 'both',
      subject,
      content,
      templateKey = 'system.announcement',
      actionUrl,
      scheduledAt,
      idempotencyKey,
    } = body

    if (!subject || typeof subject !== 'string' || !subject.trim()) {
      return NextResponse.json({ error: 'Notification subject is required.' }, { status: 400 })
    }

    if (!content || typeof content !== 'string' || !content.trim()) {
      return NextResponse.json({ error: 'Notification content is required.' }, { status: 400 })
    }

    if (!idempotencyKey || typeof idempotencyKey !== 'string') {
      return NextResponse.json({ error: 'idempotencyKey is required to prevent duplicate broadcasts.' }, { status: 400 })
    }

    const supabase = createServiceRoleClient()

    // 1. Idempotency Check: check if broadcast with this idempotency key was recorded
    const { data: existingAudit } = await supabase
      .from('admin_audit_logs')
      .select('id, created_at')
      .eq('action', 'notification_broadcast_sent')
      .eq('target_id', idempotencyKey)
      .maybeSingle()

    if (existingAudit) {
      return NextResponse.json({
        error: 'This broadcast has already been submitted and processed (idempotency key matched).',
      }, { status: 409 })
    }

    // 2. Resolve Target Audience
    const recipients: BroadcastRecipient[] = []

    if (audience === 'individual') {
      if (!targetUserId) {
        return NextResponse.json({ error: 'targetUserId is required for individual audience.' }, { status: 400 })
      }
      const { data: u } = await supabase
        .from('users')
        .select('id, email, name')
        .eq('id', targetUserId)
        .maybeSingle()

      if (!u) {
        return NextResponse.json({ error: 'Target user not found.' }, { status: 404 })
      }
      recipients.push({
        id: u.id,
        email: u.email,
        name: u.name || 'Learner',
      })
    } else if (audience === 'cohort') {
      if (!cohortId) {
        return NextResponse.json({ error: 'cohortId is required for cohort audience.' }, { status: 400 })
      }
      const { data: members } = await supabase
        .from('cohort_members')
        .select('user_id, users(id, email, name)')
        .eq('cohort_id', cohortId)

      if (members) {
        for (const m of members) {
          const u = m.users as unknown as { id: string; email: string; name: string | null } | null
          if (u?.email) {
            recipients.push({ id: u.id, email: u.email, name: u.name || 'Learner' })
          }
        }
      }
    } else if (audience === 'all') {
      // Fetch active registered learners (cap at safe broadcast bound: 10,000)
      const { data: allUsers } = await supabase
        .from('users')
        .select('id, email, name')
        .order('created_at', { ascending: false })
        .limit(10000)

      if (allUsers) {
        for (const u of allUsers) {
          if (u.email) {
            recipients.push({ id: u.id, email: u.email, name: u.name || 'Learner' })
          }
        }
      }
    } else {
      return NextResponse.json({ error: `Unsupported audience '${audience}'` }, { status: 400 })
    }

    if (recipients.length === 0) {
      return NextResponse.json({ error: 'No eligible recipients found for this audience.' }, { status: 400 })
    }

    let enqueuedCount = 0
    let inAppCount = 0
    const errors: string[] = []

    // 3. Dispatch to In-App and/or Email channels
    const sendInApp = channel === 'in_app' || channel === 'both'
    const sendEmail = channel === 'email' || channel === 'both'

    for (const recipient of recipients) {
      const eventId = `bcast-${idempotencyKey.slice(0, 8)}-${recipient.id}`

      if (sendInApp) {
        try {
          await createInAppNotification({
            userId: recipient.id,
            eventId,
            category: 'announcement',
            title: subject.trim(),
            body: content.trim(),
            actionUrl: actionUrl || undefined,
            priority: 'high',
          })
          inAppCount++
        } catch (inAppErr) {
          errors.push(`In-App error for ${recipient.email}: ${inAppErr instanceof Error ? inAppErr.message : 'Unknown'}`)
        }
      }

      if (sendEmail) {
        try {
          const res = await enqueueNotificationItem({
            userId: recipient.id,
            toEmail: recipient.email,
            toName: recipient.name,
            channel: 'email',
            templateKey: templateKey || 'system.announcement',
            templateVariables: {
              userName: recipient.name,
              subject: subject.trim(),
              announcementTitle: subject.trim(),
              announcementBody: content.trim(),
              actionUrl: actionUrl || undefined,
            },
            eventId: /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(idempotencyKey) ? idempotencyKey : undefined,
            eventType: 'admin.broadcast',
            category: 'learning',
            priorityLevel: 'high',
          })
          if (res.success) {
            enqueuedCount++
          }
        } catch (emailErr) {
          errors.push(`Email error for ${recipient.email}: ${emailErr instanceof Error ? emailErr.message : 'Unknown'}`)
        }
      }
    }

    // 4. Trigger queue worker if sending email immediately
    if (sendEmail && enqueuedCount > 0 && process.env.NODE_ENV !== 'test') {
      try {
        void processEmailQueue(Math.min(50, enqueuedCount))
      } catch {
        // Non-blocking
      }
    }

    // 5. Log Administrative Action
    await logAdminAction(
      authResult.userId,
      authResult.email || 'admin@prodily.me',
      'notification_broadcast_sent',
      'notification',
      idempotencyKey,
      {
        audience,
        channel,
        subject: subject.trim(),
        totalRecipients: recipients.length,
        inAppCreated: inAppCount,
        emailEnqueued: enqueuedCount,
        scheduledAt: scheduledAt || null,
        errorCount: errors.length,
      }
    )

    revalidatePath('/admin/communications')

    return NextResponse.json({
      success: true,
      message: `Broadcast successfully dispatched to ${recipients.length} recipients.`,
      stats: {
        totalRecipients: recipients.length,
        inAppCreated: inAppCount,
        emailEnqueued: enqueuedCount,
        errors: errors.slice(0, 5),
      },
    })
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown server error during broadcast'
    void logSystemError({
      severity: 'error',
      category: 'system',
      operation: 'admin_notification_broadcast_exception',
      message: errorMsg,
    })
    return NextResponse.json({ error: errorMsg }, { status: 500 })
  }
}
