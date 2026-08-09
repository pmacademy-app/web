import type { Metadata } from 'next'
import Link from 'next/link'
import { SettingsTabs } from '@/components/settings/SettingsTabs'
import { Settings, Shield, HelpCircle } from 'lucide-react'
import { BRAND } from '@/lib/brand'

export const metadata: Metadata = {
  title: 'Settings & Preferences',
  description: `Manage your ${BRAND.product} public portfolio handle, notification preferences, and privacy controls.`,
}

export default function SettingsPage() {
  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl space-y-8">
      {/* Header */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Settings className="h-5 w-5 text-primary" />
          <span className="text-xs font-bold uppercase tracking-wider text-primary">
            Account & Preference Settings
          </span>
        </div>
        <h1 className="text-3xl md:text-4xl font-bold font-serif text-foreground">
          Settings & Preferences
        </h1>
        <p className="text-sm text-muted-foreground max-w-xl leading-relaxed">
          Customize how your public portfolio appears and control your in-app and email notification preferences.
        </p>
      </div>

      {/* Tabbed Settings */}
      <SettingsTabs />

      {/* Privacy & Support Notice */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="p-4 rounded-xl border border-border bg-card/40 text-xs text-muted-foreground flex items-start gap-3">
          <Shield className="w-5 h-5 text-primary shrink-0 mt-0.5" />
          <p className="leading-relaxed">
            <strong className="text-foreground font-semibold">Privacy Commitment:</strong> {BRAND.product} never sells or exposes private reflection notes. Only reflections and capstones explicitly marked as public will appear on your public portfolio page. Read our{' '}
            <Link href="/privacy" className="text-primary underline font-medium">Privacy Policy</Link> and{' '}
            <Link href="/terms" className="text-primary underline font-medium">Terms of Service</Link>.
          </p>
        </div>

        <div className="p-4 rounded-xl border border-border bg-card/40 text-xs text-muted-foreground flex items-start gap-3 justify-between">
          <div className="flex items-start gap-3">
            <HelpCircle className="w-5 h-5 text-primary shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="text-foreground font-semibold">Need Help or Support?</p>
              <p className="leading-relaxed">
                Have questions about your progress, certificates, or platform features? Reach out to our team anytime.
              </p>
            </div>
          </div>
          <Link
            href="/contact"
            className="text-xs font-bold text-primary hover:underline shrink-0 pt-0.5"
          >
            Contact Support →
          </Link>
        </div>
      </div>
    </div>
  )
}
