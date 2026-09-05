import { NextResponse } from 'next/server'
import { requireAdminUser } from '@/lib/admin/guard'
import { FellowRequestAdminService } from '@/lib/admin/fellow-request-service'

export async function GET(request: Request) {
  const auth = await requireAdminUser(request)
  if (!auth.authorized) {
    return NextResponse.json({ error: auth.error }, { status: auth.statusCode || 403 })
  }

  try {
    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status') || undefined
    const queue = await FellowRequestAdminService.getQueue(status)

    return NextResponse.json({ success: true, requests: queue })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to fetch Fellow request queue.'
    console.error('[API GET /api/admin/fellow-requests] Error:', error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
