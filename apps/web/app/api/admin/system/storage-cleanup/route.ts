import { withRoute } from '@/lib/api/with-route'
import { AvatarService } from '@/lib/avatar/avatar-service'
import { adminErrorMessage } from '@/lib/errors/api-response'

export const runtime = 'nodejs'

export const POST = withRoute(
  {
    actor: { allow: ['admin'] },
    operation: 'admin.system.storage_cleanup.post',
    domain: 'admin',
    summary: 'Unexpected failure in POST /api/admin/system/storage-cleanup',
  },
  async ({ request }) => {
    try {
      const body = (await request.json().catch(() => ({}))) as {
        dryRun?: unknown
        minAgeHours?: unknown
      }
      const dryRun = typeof body.dryRun === 'boolean' ? body.dryRun : true
      const minAgeHours = typeof body.minAgeHours === 'number' ? body.minAgeHours : 24

      const result = await AvatarService.cleanupOrphanedAvatars({ dryRun, minAgeHours })
      return Response.json({ success: true, data: result }, { status: 200 })
    } catch (err: unknown) {
      const errorMsg = adminErrorMessage(err, 'Storage cleanup failed.')
      console.error('[AdminStorageCleanup] Execution failed:', err)
      return Response.json({ success: false, error: errorMsg }, { status: 500 })
    }
  }
)
