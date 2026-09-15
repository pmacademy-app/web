import { NextResponse } from 'next/server'

import { logAdminAction } from '@/lib/admin/guard'
import { requireAdmin } from '@/lib/api/actor'
import { withRoute } from '@/lib/api/with-route'
import { adminErrorMessage } from '@/lib/errors/api-response'
import { globalFeatureFlagService } from '@/lib/notifications/feature-flags/service'

export const GET = withRoute(
  {
    actor: { allow: ['admin'] },
    operation: 'admin.feature_flags.get',
    domain: 'admin',
    summary: 'Unexpected failure in GET /api/admin/feature-flags',
  },
  async () => {
    // Read through to the persisted set so the console never renders this instance's
    // in-memory defaults as if they were the saved configuration.
    await globalFeatureFlagService.ensureHydrated()
    const flags = globalFeatureFlagService.getAll()
    return NextResponse.json({ success: true, flags })
  }
)

export const PATCH = withRoute(
  {
    actor: { allow: ['admin'] },
    operation: 'admin.feature_flags.patch',
    domain: 'admin',
    summary: 'Unexpected failure in PATCH /api/admin/feature-flags',
  },
  async ({ request, actor }) => {
    const admin = requireAdmin(actor)
    try {
      const body = await request.json()
      const { key, enabled } = body as { key: string; enabled: boolean }

      if (!key || typeof enabled !== 'boolean') {
        return NextResponse.json({ error: 'Missing key or enabled state' }, { status: 400 })
      }

      const updated = await globalFeatureFlagService.setFlag(key, enabled)

      await logAdminAction(
        admin.userId,
        admin.email,
        enabled ? 'enable_feature_flag' : 'disable_feature_flag',
        'feature_flag',
        key
      )

      return NextResponse.json({ success: true, flag: updated })
    } catch (err) {
      const message = adminErrorMessage(err, 'Failed to toggle feature flag')
      return NextResponse.json({ success: false, error: message }, { status: 500 })
    }
  }
)
