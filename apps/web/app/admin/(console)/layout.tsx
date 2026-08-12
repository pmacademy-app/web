import React from 'react'
import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { createAuthenticatedServerClient } from '@/lib/supabase'
import { isAdminUser } from '@/lib/admin/authorization'
import { AdminConsoleShell } from '@/components/admin/AdminConsoleShell'

export const metadata = {
  title: 'Admin Console',
  description: 'Operational control center for Prodily PM Academy administrators.',
  robots: {
    index: false,
    follow: false,
  },
}

/**
 * Server-side authorization guard for every Admin Console page.
 *
 * Runs in addition to the middleware RBAC check (defense in depth). Reads the
 * active session and verifies authorization against ADMIN_EMAILS AND the
 * `users.is_admin` database flag before rendering the console shell.
 */
export default async function AdminConsoleLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies()
  const accessToken = cookieStore.get('sb-access-token')?.value

  if (!accessToken) {
    redirect('/admin/login')
  }

  const supabase = createAuthenticatedServerClient(accessToken)
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/admin/login')
  }

  const authorized = await isAdminUser(supabase, user.id, user.email)
  if (!authorized) {
    redirect('/admin/access-denied')
  }

  return (
    <AdminConsoleShell>
      {children}
    </AdminConsoleShell>
  )
}
