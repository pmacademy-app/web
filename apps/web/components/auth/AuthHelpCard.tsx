import React from 'react'
import { HelpCircle } from 'lucide-react'
import { BRAND } from '@/lib/brand'

interface AuthHelpCardProps {
  title: string
  description: string
}

export function AuthHelpCard({ title, description }: AuthHelpCardProps) {
  return (
    <div className="mt-6 rounded-xl border border-border bg-card/60 p-4 shadow-2xs space-y-2">
      <div className="flex items-start gap-2.5">
        <div className="p-1 rounded-md bg-primary/10 text-primary flex-shrink-0 mt-0.5">
          <HelpCircle className="w-4 h-4" aria-hidden="true" />
        </div>
        <div className="space-y-1 text-xs">
          <h2 className="font-semibold text-foreground">{title}</h2>
          <p className="text-muted-foreground leading-relaxed">
            {description}
          </p>
          <div className="pt-1">
            <a
              href={`mailto:${BRAND.supportEmail}`}
              className="font-medium text-primary hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 rounded"
            >
              {BRAND.supportEmail}
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}
