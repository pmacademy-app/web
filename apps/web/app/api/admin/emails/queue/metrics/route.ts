import { NextRequest, NextResponse } from 'next/server'
import { requireAdminUser } from '@/lib/admin/guard'
import { createServiceRoleClient } from '@/lib/supabase'

export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  try {
    const authResult = await requireAdminUser(request)
    if (!authResult.authorized || !authResult.userId) {
      return NextResponse.json(
        { error: authResult.error || 'Unauthorized' },
        { status: authResult.statusCode || 403 }
      )
    }

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
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to fetch queue metrics'
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
