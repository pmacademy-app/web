import { BrandMarkProdily } from '@/components/brand/BrandLogo'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Under Maintenance — Prodily',
  description: 'Prodily is currently undergoing scheduled maintenance. We will be back shortly.',
  robots: { index: false, follow: false },
}

export default function MaintenancePage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background px-4">
      <div className="max-w-sm w-full text-center space-y-6">
        <div className="flex justify-center">
          <BrandMarkProdily size="md" />
        </div>
        <div className="space-y-2">
          <h1 className="text-2xl font-bold font-serif text-foreground">
            We&apos;ll be right back
          </h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Prodily is currently undergoing scheduled maintenance. We&apos;re working hard to improve your experience. Please check back shortly.
          </p>
        </div>
        <div className="inline-flex items-center gap-2 text-xs text-muted-foreground border border-border rounded-full px-4 py-2">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500" />
          </span>
          Maintenance in progress
        </div>
      </div>
    </div>
  )
}
