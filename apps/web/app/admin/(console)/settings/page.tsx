import { SettingsService } from '@/lib/admin/settings-service'
import { SettingsWorkspace } from '@/components/admin/SettingsWorkspace'
import type { SettingsSectionKey } from '@/lib/admin/types'

export const revalidate = 0

interface PageProps {
  searchParams: Promise<{ section?: string }>
}

const VALID_SECTIONS: SettingsSectionKey[] = [
  'product',
  'learning',
  'email',
  'notifications',
  'feature-flags',
  'onboarding',
]

export default async function AdminSettingsPage({ searchParams }: PageProps) {
  const params = await searchParams
  const section = VALID_SECTIONS.includes(params.section as SettingsSectionKey)
    ? (params.section as SettingsSectionKey)
    : 'product'

  // Fetch all settings in parallel for the initial load
  const [product, learning, email, notifications, featureFlags, onboarding] = await Promise.all([
    SettingsService.getProductSettings(),
    SettingsService.getLearningSettings(),
    SettingsService.getEmailSettings(),
    SettingsService.getNotificationSettings(),
    SettingsService.getFeatureFlags(),
    SettingsService.getOnboardingSettings(),
  ])

  const initialData = { product, learning, email, notifications, 'feature-flags': featureFlags, onboarding }

  return (
    <SettingsWorkspace
      initialSection={section}
      initialData={initialData}
    />
  )
}