'use client'

import React, { useRef, useState } from 'react'
import { AdminSidebar } from './AdminSidebar'
import { AdminHeader } from './AdminHeader'
import { AdminShellProvider } from './admin-shell-context'
import { AdminToastProvider } from './admin-toast'

export interface AdminConsoleUser {
  name: string | null
  email: string
}

interface AdminConsoleShellProps {
  children: React.ReactNode
  user?: AdminConsoleUser
  /** Live attention counts keyed by nav href (sidebar badges). */
  attention?: Record<string, number>
  /** Total actionable items (header bell dot). */
  attentionTotal?: number
  /** Whether the database is reachable (header status chip). */
  systemOnline?: boolean
}

export function AdminConsoleShell({
  children,
  user,
  attention,
  attentionTotal = 0,
  systemOnline = true,
}: AdminConsoleShellProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const shellRef = useRef<HTMLDivElement>(null)

  return (
    <AdminShellProvider shellRef={shellRef}>
      <AdminToastProvider>
        <div
          ref={shellRef}
          className="admin-console min-h-screen bg-admin-bg text-admin-fg flex font-sans antialiased selection:bg-admin-accent/30 selection:text-admin-accent"
        >
          <AdminSidebar
            mobileOpen={mobileMenuOpen}
            onMobileClose={() => setMobileMenuOpen(false)}
            user={user}
            attention={attention}
          />
          <div className="flex-1 flex flex-col min-w-0">
            <AdminHeader
              onToggleMobileMenu={() => setMobileMenuOpen((prev) => !prev)}
              user={user}
              attentionTotal={attentionTotal}
              systemOnline={systemOnline}
            />
            <main className="flex-1 p-4 sm:p-6 md:p-8 max-w-7xl w-full mx-auto space-y-6 sm:space-y-8 overflow-y-auto">
              {children}
            </main>
          </div>
        </div>
      </AdminToastProvider>
    </AdminShellProvider>
  )
}