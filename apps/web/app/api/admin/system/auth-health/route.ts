import { withRoute } from '@/lib/api/with-route'
import { SystemService } from '@/lib/admin/system-service'

export const runtime = 'nodejs'

export const GET = withRoute(
  {
    actor: { allow: ['admin'] },
    operation: 'admin.system.auth_health.get',
    domain: 'admin',
    summary: 'Unexpected failure in GET /api/admin/system/auth-health',
  },
  async () => {
    try {
      const data = await SystemService.getAuthHealthTelemetry()
      return Response.json({ success: true, data }, { status: 200 })
    } catch (err) {
      console.error('[AdminSystemAuthHealth] Failed to fetch auth health:', err)
      return Response.json({ success: false, error: 'Failed to fetch authentication health' }, { status: 500 })
    }
  }
)
