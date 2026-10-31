import Link from 'next/link'
import { CheckCircle2, ArrowRight } from 'lucide-react'
import { sanitizeNextPath } from '@/lib/auth/oauth-intent'

type SearchParams = Promise<Record<string, string | string[] | undefined>>

/**
 * Where "Set up your path" goes. A sanitized `?next=` (the lesson the learner was reading
 * before signing up) is carried into onboarding so it can send them back there (S2).
 */
function verifiedOnboardingHref(rawNext: string | string[] | undefined): string {
  const raw = Array.isArray(rawNext) ? rawNext[0] : rawNext
  const next = sanitizeNextPath(raw?.trim(), '')
  return next ? `/onboarding?next=${encodeURIComponent(next)}` : '/onboarding'
}

export default async function VerifiedPage({
  searchParams = Promise.resolve({}),
}: {
  searchParams?: SearchParams
} = {}) {
  const params = (await searchParams) ?? {}
  const onboardingHref = verifiedOnboardingHref(params.next)

  return (
    <div className="flex flex-col items-center justify-center min-h-[80vh] px-4 animate-fade-in">
      <div className="w-full max-w-md bg-card border border-border rounded-2xl p-8 md:p-10 shadow-lg text-center space-y-6">
        <div className="flex justify-center">
          <div className="flex items-center justify-center w-20 h-20 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 animate-scale-in">
            <CheckCircle2 className="h-10 w-10" />
          </div>
        </div>

        <div className="space-y-2">
          <h1 className="text-3xl font-bold font-serif text-foreground">Email Verified!</h1>
          <p className="text-muted-foreground text-sm leading-relaxed max-w-xs mx-auto">
            Your email address has been successfully verified. You are ready to start learning.
          </p>
        </div>

        <div className="pt-4">
          <Link
            href={onboardingHref}
            className="inline-flex items-center justify-center w-full rounded-xl bg-primary px-6 py-3.5 text-sm font-bold text-primary-foreground shadow hover:bg-primary/95 transition-all group"
          >
            Set up your path
            <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </div>
      </div>
    </div>
  )
}
