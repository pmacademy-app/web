import { createBrowserSupabaseClient } from '@/lib/supabase'

/**
 * Signs the admin out of the console: revokes the Supabase session and
 * clears the httpOnly server-side session cookie, then navigates to the
 * admin login page. Shared by the AdminHeader and AdminSidebar sign-out
 * controls so both behave identically.
 */
export async function signOutAdmin(router: { push: (href: string) => void; refresh: () => void }) {
  try {
    const supabase = createBrowserSupabaseClient()
    await supabase.auth.signOut()

    // Clear server-side session cookies
    await fetch('/api/auth/session', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ action: 'sign_out', session: null }),
    })

    router.push('/admin/login')
    router.refresh()
  } catch (err) {
    console.error('[Admin] Sign out error:', err)
  }
}
