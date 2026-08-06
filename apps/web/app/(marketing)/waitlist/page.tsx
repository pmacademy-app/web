import type { Metadata } from 'next'
import { WaitlistForm } from '@/components/forms/waitlist-form'
import { BRAND } from '@/lib/brand'

export const metadata: Metadata = {
  title: 'Join the Waitlist',
  description: `${BRAND.positioning} Get early launch updates and preview access.`,
}

export default function WaitlistPage() {
  return (
    <div className="container mx-auto px-4 py-16 max-w-md">
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold font-serif text-foreground mb-2">
          Join the {BRAND.fullName} Waitlist
        </h1>
        <p className="text-sm text-muted-foreground">
          {BRAND.positioning} Get early launch updates and preview access.
        </p>
      </div>

      <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
        <WaitlistForm />
      </div>
    </div>
  )
}
