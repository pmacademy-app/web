import { NextRequest, NextResponse } from 'next/server'
import { requireAdminUser, logAdminAction } from '@/lib/admin/guard'
import { createServiceRoleClient } from '@/lib/supabase'

export const runtime = 'nodejs'

interface RouteParams {
  params: Promise<{ id: string }>
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const authResult = await requireAdminUser(request)
    if (!authResult.authorized || !authResult.userId) {
      return NextResponse.json(
        { error: authResult.error || 'Unauthorized' },
        { status: authResult.statusCode || 403 }
      )
    }

    const { id } = await params
    const supabase = createServiceRoleClient()

    // 1. Fetch current queue item
    const { data: item, error: fetchErr } = await supabase
      .from('email_queue')
      .select('id, to_email, template_key, status, attempt_count')
      .eq('id', id)
      .maybeSingle()

    if (fetchErr || !item) {
      return NextResponse.json({ error: 'Queue item not found.' }, { status: 404 })
    }

    // 2. State invariant: Only failed, dead_letter, or retrying items can be retried
    if (['delivered', 'processing'].includes(item.status)) {
      return NextResponse.json(
        { error: `Cannot retry queue item in '${item.status}' status.` },
        { status: 400 }
      )
    }

    const isCritical = item.template_key === 'auth.verify_email' || item.template_key === 'auth.password_reset'

    // 3. Suppression check (for non-critical emails)
    if (!isCritical) {
      const { data: suppression } = await supabase
        .from('email_suppressions')
        .select('id')
        .eq('email', item.to_email)
        .maybeSingle()

      if (suppression) {
        await supabase
          .from('email_queue')
          .update({
            status: 'suppressed',
            skipped_reason: 'email_suppressed',
            updated_at: new Date().toISOString(),
          })
          .eq('id', id)

        return NextResponse.json(
          { error: `Recipient '${item.to_email}' is on the suppression list. Item marked as suppressed.` },
          { status: 400 }
        )
      }
    }

    // 4. Atomic Re-queue
    const now = new Date().toISOString()
    const { data: updated, error: updateErr } = await supabase
      .from('email_queue')
      .update({
        status: 'pending',
        attempt_count: 0,
        error_message: null,
        failed_at: null,
        scheduled_at: now,
        updated_at: now,
      })
      .eq('id', id)
      .in('status', ['failed', 'dead_letter', 'retrying', 'skipped', 'suppressed'])
      .select('id, status')
      .maybeSingle()

    if (updateErr || !updated) {
      return NextResponse.json(
        { error: 'Failed to requeue item. It may have already been claimed or transitioned by a concurrent process.' },
        { status: 409 }
      )
    }

    await logAdminAction(
      authResult.userId,
      authResult.email || 'admin@prodily.me',
      'email_queue_retried',
      'email_queue',
      id,
      {
        toEmail: item.to_email,
        templateKey: item.template_key,
        previousStatus: item.status,
      }
    )

    return NextResponse.json({
      success: true,
      message: `Email to ${item.to_email} requeued for delivery.`,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Retry failed'
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
