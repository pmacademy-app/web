import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { createClient } from '@supabase/supabase-js'
import { createServiceRoleClient } from '@/lib/supabase'
import { SettingsService } from '@/lib/admin/settings-service'
import OnboardingWizard from './OnboardingWizard'

export default async function OnboardingPage() {
  const cookieStore = await cookies()
  const accessToken = cookieStore.get('sb-access-token')?.value

  if (!accessToken) {
    redirect('/login')
  }

  // Verify token
  const authSupabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } }
  )
  const { data: { user }, error: authError } = await authSupabase.auth.getUser(accessToken)

  if (authError || !user) {
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
