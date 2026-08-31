import { redirect } from 'next/navigation'
import { createServiceRoleClient } from '@/lib/supabase'
import { SettingsService } from '@/lib/admin/settings-service'
import { getServerUser } from '@/lib/auth'
import OnboardingWizard from './OnboardingWizard'

export default async function OnboardingPage() {
  const user = await getServerUser()

  if (!user) {
    redirect('/login')
  }

  // Fetch current profile to pre-fill and onboarding settings in parallel
  const dbSupabase = createServiceRoleClient()
  const [{ data: profile }, onboardingSettings] = await Promise.all([
    dbSupabase.from('users').select('*').eq('id', user.id).single(),
    SettingsService.getOnboardingSettings().catch(() => null),
  ])

  return (
    <OnboardingWizard
      user={user}
      profile={profile as unknown as Record<string, unknown>}
      onboardingSettings={onboardingSettings || undefined}
    />
  )
}
