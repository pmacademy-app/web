'use client'

import * as React from 'react'

/**
 * Provides the Admin Console shell root element (the `.admin-console` div).
 *
 * Base UI portals (Drawer, Menu, Select, AlertDialog) render into
 * `document.body` by default. The admin design tokens are scoped to
 * `.admin-console`, so portal popups must mount inside that element to
 * resolve `--admin-*` variables. Components that portal should consume
 * this context and pass `container={shellRef}` to their Portal.
 */
const AdminShellContext = React.createContext<React.RefObject<HTMLElement | null> | null>(null)

export function AdminShellProvider({
  children,
  shellRef,
}: {
  children: React.ReactNode
  shellRef: React.RefObject<HTMLElement | null>
}) {
  return (
    <AdminShellContext.Provider value={shellRef}>
      {children}
    </AdminShellContext.Provider>
  )
}

export function useAdminShell() {
  return React.useContext(AdminShellContext)
}