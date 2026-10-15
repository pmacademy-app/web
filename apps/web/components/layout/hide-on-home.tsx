'use client'

import type { ReactNode } from 'react'
import { usePathname } from 'next/navigation'

/**
 * Renders `children` everywhere except the homepage, where it renders `fallback`.
 *
 * The footer is shared by every marketing page through the marketing layout, which
 * cannot see the current route on the server. The owner asked for the operator and
 * grievance block to be left off the homepage only; it stays on every other marketing
 * page, and in full on /privacy and /terms.
 */
export function HideOnHome({ children, fallback = null }: { children: ReactNode; fallback?: ReactNode }) {
  const pathname = usePathname()
  return <>{pathname === '/' ? fallback : children}</>
}
