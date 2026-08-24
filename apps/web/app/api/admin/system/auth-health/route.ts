import { requireAdminUser } from '@/lib/admin/guard'
import { SystemService } from '@/lib/admin/system-service'

export const runtime = 'nodejs'

export async function GET(request: Request) {
  const auth = await requireAdminUser(request)
  if (!auth.authorized) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const data = await SystemService.getAuthHealthTelemetry()
    return Response.json({ success: true, data }, { status: 200 })
  } catch (err) {
    console.error('[AdminSystemAuthHealth] Failed to fetch auth health:', err)
    return Response.json({ success: false, error: 'Failed to fetch authentication health' }, { status: 500 })
  }
}
