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

  // Fetch all settings in parallel for the initial load. A section that could not be read comes
  // back in `failedSections`; the workspace shows an error for it instead of a form of defaults.
  const { data: initialData, failedSections } = await SettingsService.getAdminWorkspaceSettings()

  return (
    <SettingsWorkspace
      initialSection={section}
      initialData={initialData}
      failedSections={failedSections}
    />
  )
}