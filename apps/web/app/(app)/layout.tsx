import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { createAuthenticatedServerClient, createServerSupabaseClient } from '@/lib/supabase'
import { ensureUserProfile, UserProfile } from '@/lib/auth'
import AppShell from '@/components/layout/AppShell'
import { BreadcrumbProvider } from '@/contexts/breadcrumb-context'

export default async function AuthenticatedLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const cookieStore = await cookies()
  const accessToken = cookieStore.get('sb-access-token')?.value

  if (!accessToken) {
    redirect('/login')
  }

  // Create an authenticated client to query data
  const supabase = createAuthenticatedServerClient(accessToken)

  // Get user from auth service
  const { data: { user: authUser }, error: authError } = await supabase.auth.getUser()
  if (authError || !authUser) {
    redirect('/login')
  }

  // Fetch the public.users record
  const { data: dbProfile } = await supabase
    .from('users')
    .select('*')
    .eq('id', authUser.id)
    .maybeSingle()

  let profile = dbProfile as UserProfile | null

  // Initialize profile if not found
  if (!profile) {
    const serviceSupabase = createServerSupabaseClient()
    profile = await ensureUserProfile(serviceSupabase, authUser)
    if (!profile) {
      redirect('/login')
    }
  }

  return (
    <BreadcrumbProvider>
      <AppShell userProfile={profile}>{children}</AppShell>
    </BreadcrumbProvider>
  )
}
