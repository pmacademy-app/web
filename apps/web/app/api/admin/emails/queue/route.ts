import { NextResponse } from 'next/server'
import { logAdminAction } from '@/lib/admin/guard'
import { requireAdmin } from '@/lib/api/actor'
import { withRoute } from '@/lib/api/with-route'
import { AdminConsoleService } from '@/lib/admin/service'
import { processEmailQueue } from '@/lib/notifications/queue/processor'
import { revalidateAdminShell } from '@/lib/admin/cache-tags'

export const GET = withRoute(
  {
    actor: { allow: ['admin'] },
    operation: 'admin.emails.queue.get',
    domain: 'admin',
    summary: 'Unexpected failure in GET /api/admin/emails/queue',
  },
  async () => {
    const queueOverview = await AdminConsoleService.getEmailQueueOverview()
    return NextResponse.json({ success: true, queue: queueOverview })
  }
)

export const POST = withRoute(
  {
    actor: { allow: ['admin'] },
    operation: 'admin.emails.queue.post',
    domain: 'admin',
    summary: 'Unexpected failure in POST /api/admin/emails/queue',
  },
  async ({ actor }) => {
    const admin = requireAdmin(actor)
    const result = await processEmailQueue(50)
    await logAdminAction(
      admin.userId!,
      admin.email!,
      'trigger_email_queue_processing',
      'queue',
      undefined,
      { processed: result.processed }
    )

    revalidateAdminShell()
    return NextResponse.json({ success: true, result })
  }
)
