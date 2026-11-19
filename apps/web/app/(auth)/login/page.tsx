import { Award, BookOpen, Flame } from 'lucide-react'
import { BRAND } from '@/lib/brand'
import { BrandLogo, BrandMarkProdily } from '@/components/brand/BrandLogo'
import { AuthHelpCard } from '@/components/auth/AuthHelpCard'
import { sanitizeNextPath } from '@/lib/auth/oauth-intent'
import LoginForm from './LoginForm'

type SearchParams = Promise<Record<string, string | string[] | undefined>>

function firstParam(value: string | string[] | undefined): string | null {
  const raw = Array.isArray(value) ? value[0] : value
  const trimmed = raw?.trim()
  return trimmed ? trimmed : null
}

/** Real product facts shown beside the form; keep them true to the curriculum. */
const HIGHLIGHTS = [
  { icon: Flame, title: 'Your streak and XP are saved', body: 'Pick up the lesson you left, with your progress exactly where it was.' },
  { icon: BookOpen, title: '90 lessons, one career ladder', body: 'Climb from Associate PM Trainee towards Chief Product Officer.' },
  { icon: Award, title: 'Proof employers can check', body: 'Capstones and certificates with a public verification link.' },
] as const

/** The nine career levels, drawn as the same segmented ladder the dashboard uses. */
const LADDER_SEGMENTS = 9

/**
 * Server-rendered shell for /login: brand panel, heading and card render as HTML on the
 * first response, so there is no client-only loading state. Only the form itself is a
 * client component.
 */
export default async function LoginPage({
  searchParams = Promise.resolve({}),
}: {
  searchParams?: SearchParams
} = {}) {
  const params = (await searchParams) ?? {}
  // Sanitized here, on the server, so the client only ever receives a same-origin
  // path (or nothing) and never has to import the node-only intent module.
  const next = sanitizeNextPath(firstParam(params.next), '') || null

  return (
    <div className="grid min-h-[100dvh] lg:grid-cols-[minmax(0,1fr)_minmax(0,34rem)]">
      {/* Brand panel: wide screens only. Decorative circles are aria-hidden. */}
      <aside className="relative hidden overflow-hidden bg-primary text-primary-foreground lg:flex lg:flex-col lg:justify-between lg:p-12 xl:p-16">
        <div aria-hidden="true" className="pointer-events-none absolute -right-24 -top-24 h-80 w-80 rounded-full bg-primary-foreground/[0.06]" />
        <div aria-hidden="true" className="pointer-events-none absolute -bottom-32 -left-20 h-96 w-96 rounded-full bg-primary-foreground/[0.05]" />

        <a
          href="https://prodily.app"
          aria-label="Go to Prodily homepage"
          className="relative inline-flex w-fit rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-foreground focus-visible:ring-offset-2 focus-visible:ring-offset-primary"
        >
          <BrandLogo variant="full" size="sm" onDark />
        </a>

        <div className="relative max-w-md space-y-8">
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary-foreground/70">
              Welcome back
            </p>
            <h2 className="text-3xl font-bold leading-tight tracking-tight xl:text-4xl text-balance">
              Pick up right where you left off.
            </h2>
          </div>

          <ul className="space-y-5">
            {HIGHLIGHTS.map(({ icon: Icon, title, body }) => (
              <li key={title} className="flex gap-4">
                <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-foreground/10">
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </span>
                <span>
                  <span className="block font-semibold">{title}</span>
                  <span className="mt-0.5 block text-sm leading-relaxed text-primary-foreground/75">{body}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className="relative space-y-3">
          <div aria-hidden="true" className="grid grid-cols-9 gap-1.5">
            {Array.from({ length: LADDER_SEGMENTS }, (_, i) => (
              <span
                key={i}
                className={i < 3 ? 'h-2 rounded-sm bg-primary-foreground/90' : 'h-2 rounded-sm bg-primary-foreground/15'}
              />
            ))}
          </div>
          <p className="text-sm text-primary-foreground/75">
            Nine career levels. Every lesson moves you up the ladder.
          </p>
        </div>
      </aside>

      {/* Form column */}
      <div className="flex items-center justify-center px-4 py-12 sm:px-8">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex flex-col items-center text-center lg:items-start lg:text-left">
            <a
              href="https://prodily.app"
              aria-label="Go to Prodily homepage"
              className="mb-6 inline-flex items-center justify-center rounded-lg transition-opacity hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 lg:hidden"
            >
              <BrandMarkProdily size="md" />
            </a>
            <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl text-balance">
              Log in to {BRAND.fullName}
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Continue your learning path and keep your streak going.
            </p>
          </div>

          <div className="space-y-4 rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-7">
            <LoginForm
              next={next}
              errorParam={firstParam(params.error)}
              verified={firstParam(params.verified) === 'true'}
              resetSuccess={firstParam(params.reset) === 'success'}
            />
          </div>

          <AuthHelpCard
            title="Having trouble signing in?"
            description="Facing an authentication or login issue? Email us and we'll help you out."
          />
        </div>
      </div>
    </div>
  )
}
