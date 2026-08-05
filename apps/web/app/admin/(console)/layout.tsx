import React from 'react'
import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { createAuthenticatedServerClient } from '@/lib/supabase'
import { isAdminUser } from '@/lib/admin/authorization'
import { AdminSidebar } from '@/components/admin/AdminSidebar'
import { AdminHeader } from '@/components/admin/AdminHeader'

export const metadata = {
  title: 'Admin Console | PM Academy',
  description: 'Operational control center for PM Academy administrators.',
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
    <div className="min-h-screen bg-slate-950 text-slate-100 flex font-sans antialiased selection:bg-amber-500/30 selection:text-amber-200">
      <AdminSidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <AdminHeader />
        <main className="flex-1 p-6 md:p-8 max-w-7xl w-full mx-auto space-y-8 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  )
}
