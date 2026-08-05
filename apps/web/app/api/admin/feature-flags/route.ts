import { NextResponse } from 'next/server'
import { requireAdminUser, logAdminAction } from '@/lib/admin/guard'
import { globalFeatureFlagService } from '@/lib/notifications/feature-flags/service'

export async function GET(request: Request) {
  const authGuard = await requireAdminUser(request)
  if (!authGuard.authorized) {
    return NextResponse.json({ error: authGuard.error }, { status: authGuard.statusCode || 403 })
  }

  const flags = globalFeatureFlagService.getAll()
  return NextResponse.json({ success: true, flags })
}

export async function PATCH(request: Request) {
  const authGuard = await requireAdminUser(request)
  if (!authGuard.authorized) {
    return NextResponse.json({ error: authGuard.error }, { status: authGuard.statusCode || 403 })
  }

  try {
    const body = await request.json()
    const { key, enabled } = body as { key: string; enabled: boolean }

    if (!key || typeof enabled !== 'boolean') {
      return NextResponse.json({ error: 'Missing key or enabled state' }, { status: 400 })
    }

    const updated = enabled
      ? globalFeatureFlagService.enable(key)
      : globalFeatureFlagService.disable(key)

    await logAdminAction(
      authGuard.userId!,
      authGuard.email!,
      enabled ? 'enable_feature_flag' : 'disable_feature_flag',
      'feature_flag',
      key
    )

    return NextResponse.json({ success: true, flag: updated })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to toggle feature flag'
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
