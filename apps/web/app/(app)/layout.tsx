import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { createAuthenticatedServerClient, createServerSupabaseClient } from '@/lib/supabase'
import { ensureUserProfile, UserProfile } from '@/lib/auth'
import AppShell from '@/components/layout/AppShell'
import { BreadcrumbProvider } from '@/contexts/breadcrumb-context'
import { QuickStartProvider } from '@/components/quick-start/QuickStartContext'
import { QuickStartModal } from '@/components/quick-start/QuickStartModal'

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: true,
  },
}

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

  const isOnboardingComplete = Boolean(authUser.user_metadata?.onboarding_complete || profile?.goal)
  const isQuickStartCompleted = Boolean(authUser.user_metadata?.quick_start_completed)

  return (
    <BreadcrumbProvider>
      <QuickStartProvider
        initialOnboardingComplete={isOnboardingComplete}
        initialQuickStartCompleted={isQuickStartCompleted}
      >
        <AppShell userProfile={profile}>{children}</AppShell>
        <QuickStartModal />
      </QuickStartProvider>
    </BreadcrumbProvider>
  )
}

