import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { createClient } from '@supabase/supabase-js'
import { createServiceRoleClient } from '@/lib/supabase'
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

  // Fetch current profile to pre-fill
  const dbSupabase = createServiceRoleClient()
  const { data: profile } = await dbSupabase
    .from('users')
    .select('*')
    .eq('id', user.id)
    .single()

  return <OnboardingWizard user={user} profile={profile as unknown as Record<string, unknown>} />
}
