'use client'

import { Button } from '@/components/ui/button'
import { openCookiePreferences } from '@/hooks/use-cookie-consent'

/**
 * Reopens the cookie banner so a visitor can change a decision they already made.
 *
 * A consent mechanism that cannot be revisited is not a consent mechanism, so this
 * sits in the site footer — reachable from every public page.
 */
export function CookiePreferencesButton({ className }: { className?: string }) {
  return (
    <Button type="button" variant="link" onClick={openCookiePreferences} className={className}>
      Cookie preferences
    </Button>
  )
}
