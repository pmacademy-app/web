import { NextRequest, NextResponse } from 'next/server'
import { requireAdminUser, logAdminAction } from '@/lib/admin/guard'
import { SettingsService } from '@/lib/admin/settings-service'
import type { SettingsSectionKey } from '@/lib/admin/types'

const VALID_SECTIONS: SettingsSectionKey[] = [
  'product',
  'learning',
  'email',
  'notifications',
  'feature-flags',
]

function getSectionFromRequest(request: NextRequest): SettingsSectionKey | null {
  const section = request.nextUrl.searchParams.get('section')
  if (section && VALID_SECTIONS.includes(section as SettingsSectionKey)) {
    return section as SettingsSectionKey
  }
  return null
}

export async function GET(request: NextRequest) {
  const authGuard = await requireAdminUser(request)
  if (!authGuard.authorized) {
    return NextResponse.json(
      { error: authGuard.error },
      { status: authGuard.statusCode || 403 }
    )
  }

  const section = getSectionFromRequest(request)

  try {
    if (section) {
      // Fetch single section
      let data: unknown
      switch (section) {
        case 'product':
          data = await SettingsService.getProductSettings()
          break
        case 'learning':
          data = await SettingsService.getLearningSettings()
          break
        case 'email':
          data = await SettingsService.getEmailSettings()
          break
        case 'notifications':
          data = await SettingsService.getNotificationSettings()
          break
        case 'feature-flags':
          data = await SettingsService.getFeatureFlags()
          break
      }
      return NextResponse.json({ success: true, data })
    } else {
      // Fetch all sections
      const all = await SettingsService.getAllSettings()
      return NextResponse.json({ success: true, data: all })
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to fetch settings'
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  const authGuard = await requireAdminUser(request)
  if (!authGuard.authorized) {
    return NextResponse.json(
      { error: authGuard.error },
      { status: authGuard.statusCode || 403 }
    )
  }

  const section = getSectionFromRequest(request)
  if (!section) {
    return NextResponse.json(
      { success: false, error: 'Invalid or missing section parameter' },
      { status: 400 }
    )
  }

  try {
    const body = await request.json()
    let updated: unknown
    let action: string

    switch (section) {
      case 'product':
        updated = await SettingsService.updateProductSettings(body)
        action = 'update_product_settings'
        break
      case 'learning':
        updated = await SettingsService.updateLearningSettings(body)
        action = 'update_learning_settings'
        break
      case 'email':
        updated = await SettingsService.updateEmailSettings(body)
        action = 'update_email_settings'
        break
      case 'notifications':
        updated = await SettingsService.updateNotificationSettings(body)
        action = 'update_notification_settings'
        break
      case 'feature-flags':
        // Feature flags are handled by their own API
        return NextResponse.json(
          { success: false, error: 'Use /api/admin/feature-flags for feature flag updates' },
          { status: 400 }
        )
      default:
        return NextResponse.json(
          { success: false, error: 'Unknown section' },
          { status: 400 }
        )
    }

    await logAdminAction(
      authGuard.userId!,
      authGuard.email!,
      action,
      'settings',
      section
    )

    return NextResponse.json({ success: true, data: updated })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to update settings'
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}