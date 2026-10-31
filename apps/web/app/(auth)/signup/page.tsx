import { BrandMarkProdily } from '@/components/brand/BrandLogo'
import { AuthHelpCard } from '@/components/auth/AuthHelpCard'
import { ReferralBadge } from '@/components/referral/ReferralBadge'
import { sanitizeNextPath } from '@/lib/auth/oauth-intent'
import SignupForm from './SignupForm'

type SearchParams = Promise<Record<string, string | string[] | undefined>>

function firstParam(value: string | string[] | undefined): string | null {
  const raw = Array.isArray(value) ? value[0] : value
  const trimmed = raw?.trim()
  return trimmed ? trimmed : null
}

/**
 * Server-rendered shell for /signup: logo, heading and card render as HTML on the
 * first response, so there is no client-only loading state. Only the form itself
 * (validation, Turnstile, the Google consent gate) is a client component.
 */
export default async function SignupPage({
  searchParams = Promise.resolve({}),
}: {
  searchParams?: SearchParams
} = {}) {
  const params = (await searchParams) ?? {}
  const refCode = firstParam(params.ref)
  // Sanitized here, on the server, so the client only ever receives a same-origin
  // path (or nothing) and never has to import the node-only intent module.
  const next = sanitizeNextPath(firstParam(params.next), '') || null

  return (
    <div className="container mx-auto px-4 py-16 max-w-sm">
      <div className="text-center mb-8 flex flex-col items-center">
        <a
          href="https://prodily.app"
          aria-label="Go to Prodily homepage"
          className="mb-4 inline-flex items-center justify-center rounded-lg transition-opacity hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
        >
          <BrandMarkProdily size="md" />
        </a>
        <h1 className="text-2xl font-bold font-serif text-foreground mb-2">
          Create Your Free Account
        </h1>
        <p className="text-xs text-muted-foreground">
          90 lessons. 9 modules. Always free.
        </p>
      </div>

      {refCode && <ReferralBadge refCode={refCode} />}

      <div className="rounded-xl border border-border bg-card p-6 shadow-sm space-y-4">
        <SignupForm refCode={refCode} next={next} />
      </div>

      <AuthHelpCard
        title="Having trouble creating your account?"
        description="If you run into an issue during registration, email us and we'll help you out."
      />
    </div>
  )
}
