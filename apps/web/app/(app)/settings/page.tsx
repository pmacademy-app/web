import type { Metadata } from 'next'
import Link from 'next/link'
import { SettingsTabs } from '@/components/settings/SettingsTabs'
import { Shield, HelpCircle } from 'lucide-react'
import { BRAND } from '@/lib/brand'

export const metadata: Metadata = {
  title: 'Settings & Preferences',
  description: `Manage your ${BRAND.product} public portfolio handle, notification preferences, and privacy controls.`,
}

export default function SettingsPage() {
  return (
    <div className="container mx-auto px-4 py-5 max-w-4xl space-y-4">
      {/* Compact Header with Short Action Buttons */}
      <div className="border-b border-border/60 pb-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-bold tracking-tight text-foreground">
            Settings &amp; Preferences
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Customize your public portfolio, account security, and notification preferences.
          </p>
        </div>

        {/* Short Action Buttons: Shield (Privacy) & ? (Help) */}
        <div className="flex items-center gap-2 shrink-0">
          <Link
            href="/privacy"
            title="Privacy Policy"
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-border/70 bg-card hover:bg-secondary/60 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors shadow-2xs"
          >
            <Shield className="w-3.5 h-3.5 text-primary" />
            <span>Privacy</span>
          </Link>

          <Link
            href="/contact"
            title="Need Help?"
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-border/70 bg-card hover:bg-secondary/60 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors shadow-2xs"
          >
            <HelpCircle className="w-3.5 h-3.5 text-primary" />
            <span>Help</span>
          </Link>
        </div>
      </div>

      {/* Tabbed Settings */}
      <SettingsTabs />
    </div>
  )
}
