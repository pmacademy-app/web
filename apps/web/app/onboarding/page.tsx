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

  // Phase 4: the single-screen wizard only needs the two path fields for pre-fill; identity
  // fields are deferred to Settings → Portfolio and are not surfaced here.
  const typedProfile = profile as { goal?: string | null; career_role?: string | null } | null

  return (
    <OnboardingWizard
      user={user}
      profile={
        typedProfile
          ? { goal: typedProfile.goal ?? null, career_role: typedProfile.career_role ?? null }
          : null
      }
      onboardingSettings={onboardingSettings || undefined}
    />
  )
}
