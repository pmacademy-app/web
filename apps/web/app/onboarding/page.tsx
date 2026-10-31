import { redirect } from 'next/navigation'
import { createServiceRoleClient } from '@/lib/supabase'
import { SettingsService } from '@/lib/admin/settings-service'
import { getServerUser } from '@/lib/auth'
import { sanitizeNextPath } from '@/lib/auth/oauth-intent'
import OnboardingWizard from './OnboardingWizard'

type SearchParams = Promise<Record<string, string | string[] | undefined>>

export default async function OnboardingPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams
  const rawNext = Array.isArray(params.next) ? params.next[0] : params.next
  // Where the learner was headed before onboarding interrupted them (for example the
  // lesson whose public CTA they signed up from). Sanitized to a same-origin path;
  // anything else is dropped and the wizard falls back to its recommendation.
  const nextPath = sanitizeNextPath(rawNext?.trim(), '') || null

  const user = await getServerUser()

  if (!user) {
    redirect(nextPath ? `/login?next=${encodeURIComponent(`/onboarding?next=${encodeURIComponent(nextPath)}`)}` : '/login')
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
      nextPath={nextPath}
    />
  )
}
