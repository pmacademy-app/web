'use client'

import React, { useId } from 'react'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { Award, Briefcase, GraduationCap, ExternalLink, ArrowRight } from 'lucide-react'
import { trackDashboardProofCardClicked } from '@/lib/analytics'
import {
  FULL_CURRICULUM_LESSON_COUNT,
  clampCertificateProgress,
  deriveCertificateState,
  derivePortfolioState,
  type CertificateState,
  type PortfolioState,
} from '@/lib/dashboard/proof-card'

/**
 * ShareButton picks its icon from `navigator` during render, so server and client
 * output differ in share-capable browsers. Rendering it client-only avoids the
 * hydration mismatch; the placeholder reserves its footprint so nothing shifts.
 */
const ShareButton = dynamic(
  () => import('@/components/portfolio/ShareButton').then((mod) => mod.ShareButton),
  {
    ssr: false,
    loading: () => (
      <span aria-hidden="true" className="inline-flex items-center gap-2">
        <span className="h-10 w-28 rounded-lg bg-muted/40" />
        <span className="size-10 rounded-lg bg-muted/40" />
        <span className="size-10 rounded-lg bg-muted/40" />
      </span>
    ),
  },
)

interface PortfolioProofCardProps {
  /** Public portfolio handle; null/blank means the portfolio is not set up. */
  username: string | null
  isPortfolioPublic: boolean
  completedLessons: number
  hasCertificate: boolean
  /** Lower row (Growth R4): the dashboard streams ProofExtrasSlot in here. */
  children?: React.ReactNode
}

const PILL_BASE = 'text-[9px] font-bold uppercase px-2 py-0.5 rounded border shrink-0'
const PILL_SUCCESS = `${PILL_BASE} bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20`
const PILL_WARNING = `${PILL_BASE} bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20`
const PILL_NEUTRAL = `${PILL_BASE} bg-secondary text-muted-foreground border-border`

const LABEL = 'text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5'
const FOCUS_RING =
  'rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-2 focus-visible:ring-offset-card'
const CTA_LINK = `inline-flex items-center gap-1.5 text-xs font-bold text-primary hover:text-primary/80 transition-colors cursor-pointer ${FOCUS_RING}`
const FOOTER = 'flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-border/40'

const PORTFOLIO_SETTINGS_HREF = '/settings?tab=portfolio'
const CERTIFICATES_HREF = '/progress/certificates'

/**
 * Dashboard "Portfolio & Proof" row: portfolio visibility on one side, certificate
 * progress on the other. Read-only — it links to the places where a learner can act and
 * never publishes a portfolio or issues a certificate itself.
 */
export function PortfolioProofCard({
  username,
  isPortfolioPublic,
  completedLessons,
  hasCertificate,
  children,
}: PortfolioProofCardProps) {
  const headingId = useId()
  const portfolioState = derivePortfolioState(username, isPortfolioPublic)
  const handle = typeof username === 'string' ? username.trim() : ''

  return (
    <section
      aria-labelledby={headingId}
      className="p-5 rounded-2xl border border-border/80 bg-card/60 shadow-xs"
    >
      <h2
        id={headingId}
        className="text-[10px] font-bold uppercase tracking-wider text-primary flex items-center gap-1.5"
      >
        <Award className="w-3.5 h-3.5" aria-hidden="true" /> Portfolio &amp; Proof
      </h2>

      <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-5 md:gap-0 md:divide-x md:divide-border/60">
        <PortfolioHalf state={portfolioState} handle={handle} />
        <CertificateHalf
          portfolioState={portfolioState}
          completedLessons={completedLessons}
          hasCertificate={hasCertificate}
        />
      </div>

      {children}
    </section>
  )
}

const PORTFOLIO_COPY: Record<PortfolioState, { pill: string; pillClass: string; title: string; body: string }> = {
  public: {
    pill: 'Public',
    pillClass: PILL_SUCCESS,
    title: 'Your portfolio is live',
    body: 'Share it with recruiters and peers to show your PM work.',
  },
  private: {
    pill: 'Private',
    pillClass: PILL_WARNING,
    title: 'Your portfolio is private',
    body: 'Publish it to share your capstones and progress with recruiters.',
  },
  none: {
    pill: 'Not set up',
    pillClass: PILL_WARNING,
    title: 'Set up your portfolio',
    body: 'Choose a username to get a public PM portfolio link.',
  },
}

function PortfolioHalf({ state, handle }: { state: PortfolioState; handle: string }) {
  const copy = PORTFOLIO_COPY[state]

  return (
    <div className="flex flex-col justify-between gap-3 md:pr-5">
      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <span className={LABEL}>
            <Briefcase className="w-3.5 h-3.5" aria-hidden="true" /> Portfolio
          </span>
          <span className={copy.pillClass}>{copy.pill}</span>
        </div>
        <h3 className="text-sm font-bold font-serif text-foreground">{copy.title}</h3>
        <p className="text-xs text-muted-foreground leading-relaxed">{copy.body}</p>
      </div>

      {state === 'public' ? (
        <div className={FOOTER}>
          <Link
            href={`/p/${encodeURIComponent(handle)}`}
            target="_blank"
            rel="noopener noreferrer"
            className={CTA_LINK}
            onClick={() => trackDashboardProofCardClicked('view_portfolio', 'public')}
          >
            View portfolio
            <span className="sr-only"> (opens in a new tab)</span>
            <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
          </Link>
          {/* Capture phase so the card's event fires once per click without touching ShareButton. */}
          <div
            className="inline-flex"
            data-proof-card-share=""
            onClickCapture={() => trackDashboardProofCardClicked('share_portfolio', 'public')}
          >
            <ShareButton username={handle} />
          </div>
        </div>
      ) : (
        <div className={FOOTER}>
          <Link
            href={PORTFOLIO_SETTINGS_HREF}
            className={`${CTA_LINK} w-full justify-between`}
            onClick={() =>
              trackDashboardProofCardClicked(state === 'private' ? 'publish_portfolio' : 'setup_portfolio', state)
            }
          >
            <span>{state === 'private' ? 'Publish portfolio' : 'Set up portfolio'}</span>
            <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
          </Link>
        </div>
      )}
    </div>
  )
}

const CERTIFICATE_COPY: Record<
  CertificateState,
  { pill: string; pillClass: string; title: string | null; body: string; cta: string }
> = {
  earned: {
    pill: 'Earned',
    pillClass: PILL_SUCCESS,
    title: 'Certificate earned',
    body: 'Add your verifiable certificate to LinkedIn or share it with recruiters.',
    cta: 'View certificate',
  },
  ready: {
    pill: 'Ready',
    pillClass: PILL_SUCCESS,
    title: `You've completed all ${FULL_CURRICULUM_LESSON_COUNT} lessons`,
    body: 'Claim your verifiable certificate and add it to LinkedIn.',
    cta: 'Claim certificate',
  },
  in_progress: {
    pill: 'In progress',
    pillClass: PILL_NEUTRAL,
    title: null,
    body: `Complete all ${FULL_CURRICULUM_LESSON_COUNT} lessons to earn a verifiable certificate you can add to LinkedIn.`,
    cta: 'View certificates',
  },
  not_started: {
    pill: 'Not started',
    pillClass: PILL_NEUTRAL,
    title: null,
    body: 'Every lesson you finish counts toward a verifiable certificate you can add to LinkedIn.',
    cta: 'View certificates',
  },
}

function CertificateProgress({ done }: { done: number }) {
  const percent = Math.round((done / FULL_CURRICULUM_LESSON_COUNT) * 100)

  return (
    <>
      <h3 className="sr-only">Certificate progress</h3>
      <p className="flex items-baseline gap-1.5">
        <span className="text-2xl font-extrabold text-foreground font-mono">{done}</span>
        <span className="text-xs text-muted-foreground font-medium">
          {` / ${FULL_CURRICULUM_LESSON_COUNT} lessons`}
        </span>
      </p>
      <div
        role="progressbar"
        aria-valuenow={done}
        aria-valuemin={0}
        aria-valuemax={FULL_CURRICULUM_LESSON_COUNT}
        aria-valuetext={`${done} of ${FULL_CURRICULUM_LESSON_COUNT} lessons completed`}
        aria-label="Certificate progress"
        className="h-2 w-full bg-surface-muted rounded-full overflow-hidden"
      >
        <div
          className="h-full rounded-full bg-primary transition-[width] duration-300 ease-out motion-reduce:transition-none"
          style={{ width: `${percent}%` }}
        />
      </div>
    </>
  )
}

function CertificateHalf({
  portfolioState,
  completedLessons,
  hasCertificate,
}: {
  portfolioState: PortfolioState
  completedLessons: number
  hasCertificate: boolean
}) {
  const state = deriveCertificateState(hasCertificate, completedLessons)
  const copy = CERTIFICATE_COPY[state]
  const trackCertificates = () => trackDashboardProofCardClicked('view_certificates', portfolioState)

  return (
    <div className="flex flex-col justify-between gap-3 border-t border-border/60 pt-5 md:border-t-0 md:pt-0 md:pl-5">
      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <span className={LABEL}>
            <GraduationCap className="w-3.5 h-3.5" aria-hidden="true" /> Certificate
          </span>
          <span className={copy.pillClass}>{copy.pill}</span>
        </div>

        {copy.title ? (
          <h3 className="text-sm font-bold font-serif text-foreground">{copy.title}</h3>
        ) : (
          <CertificateProgress done={clampCertificateProgress(completedLessons)} />
        )}
        <p className={`text-xs text-muted-foreground leading-relaxed${copy.title ? '' : ' pt-1'}`}>{copy.body}</p>
      </div>

      <div className={FOOTER}>
        <Link href={CERTIFICATES_HREF} className={`${CTA_LINK} w-full justify-between`} onClick={trackCertificates}>
          <span>{copy.cta}</span>
          <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
        </Link>
      </div>
    </div>
  )
}
