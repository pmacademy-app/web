import { NextResponse } from 'next/server'
import { withRoute } from '@/lib/api/with-route'
import { createServiceRoleClient } from '@/lib/supabase'

export const runtime = 'nodejs'

export const GET = withRoute(
  {
    actor: { allow: ['admin'] },
    operation: 'admin.emails.queue.metrics.get',
    domain: 'admin',
    summary: 'Unexpected failure in GET /api/admin/emails/queue/metrics',
  },
  async () => {
    const supabase = createServiceRoleClient()

    const [
      totalRes,
      pendingRes,
      processingRes,
      deliveredRes,
      failedRes,
      deadLetterRes,
      suppressedRes,
      oldestPendingRes,
    ] = await Promise.all([
      supabase.from('email_queue').select('id', { count: 'exact', head: true }),
      supabase.from('email_queue').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
      supabase.from('email_queue').select('id', { count: 'exact', head: true }).eq('status', 'processing'),
      supabase.from('email_queue').select('id', { count: 'exact', head: true }).eq('status', 'delivered'),
      supabase.from('email_queue').select('id', { count: 'exact', head: true }).in('status', ['failed', 'retrying']),
      supabase.from('email_queue').select('id', { count: 'exact', head: true }).eq('status', 'dead_letter'),
      supabase.from('email_queue').select('id', { count: 'exact', head: true }).eq('status', 'suppressed'),
      supabase.from('email_queue').select('created_at').eq('status', 'pending').order('created_at', { ascending: true }).limit(1).maybeSingle(),
    ])

    if (
      totalRes.error ||
      pendingRes.error ||
      processingRes.error ||
      deliveredRes.error ||
      failedRes.error ||
      deadLetterRes.error ||
      suppressedRes.error ||
      oldestPendingRes.error
    ) {
      const firstErr =
        totalRes.error ||
        pendingRes.error ||
        processingRes.error ||
        deliveredRes.error ||
        failedRes.error ||
        deadLetterRes.error ||
        suppressedRes.error ||
        oldestPendingRes.error
      throw new Error(`Failed to fetch queue metrics: ${firstErr?.message}`)
    }

    return NextResponse.json({
      success: true,
      metrics: {
        total: totalRes.count || 0,
        pending: pendingRes.count || 0,
        processing: processingRes.count || 0,
        delivered: deliveredRes.count || 0,
        failed: failedRes.count || 0,
        deadLetter: deadLetterRes.count || 0,
        suppressed: suppressedRes.count || 0,
        oldestPendingCreatedAt: oldestPendingRes.data?.created_at || null,
      },
    })
  }
)
