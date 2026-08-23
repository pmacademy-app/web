import { requireAdminUser } from '@/lib/admin/guard'
import { AvatarService } from '@/lib/avatar/avatar-service'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  const auth = await requireAdminUser(request)
  if (!auth.authorized) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json().catch(() => ({}))
    const dryRun = typeof body.dryRun === 'boolean' ? body.dryRun : true
    const minAgeHours = typeof body.minAgeHours === 'number' ? body.minAgeHours : 24

    const result = await AvatarService.cleanupOrphanedAvatars({ dryRun, minAgeHours })
    return Response.json({ success: true, data: result }, { status: 200 })
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Storage cleanup failed.'
    console.error('[AdminStorageCleanup] Execution failed:', err)
    return Response.json({ success: false, error: errorMsg }, { status: 500 })
  }
}
