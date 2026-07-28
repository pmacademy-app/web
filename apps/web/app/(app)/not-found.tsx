import Link from 'next/link'
import { HelpCircle, Home } from 'lucide-react'

export default function AppNotFound() {
  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center text-center p-6 space-y-6">
      <div className="p-4 rounded-full bg-primary/10 text-primary border border-primary/20">
        <HelpCircle className="w-10 h-10" />
      </div>

      <div className="space-y-2 max-w-md">
        <h2 className="text-2xl font-bold font-serif text-foreground">
          Page Not Found
        </h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          The requested topic, review item, or section does not exist in this curriculum.
        </p>
      </div>

      <div className="pt-2">
        <Link
          href="/dashboard"
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary py-2.5 px-5 text-sm font-semibold text-primary-foreground shadow hover:bg-primary/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 transition-colors"
        >
          <Home className="w-4 h-4" />
          Return to Dashboard
        </Link>
      </div>
    </div>
  )
}
