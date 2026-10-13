/**
 * "What you leave with": the three things a learner keeps after the course.
 *
 * 1. Portfolio page: a drawn page frame with real capstone titles under the
 *    sample name. Links to a real public portfolio (SAMPLE_PORTFOLIO_PATH).
 * 2. Certificate: the exported sample render, labelled as a sample. It deliberately
 *    has no verification link, because a sample has nothing to verify.
 * 3. PM Fellow: a distinction a person on the team grants after review. Not an
 *    automated score; the copy says only what lib/fellow.ts does.
 *
 * Server component. The one tracked link is the TrackedLink client leaf.
 */

import Image from 'next/image'
import { ArrowRight } from 'lucide-react'

import { IllustrationCaption } from '@/components/marketing/illustration-caption'
import {
  ARROW_NUDGE,
  BAND_MUTED,
  CARD,
  CONTAINER,
  LINK_QUIET,
  SECTION_TITLE,
  SECTION_Y,
} from '@/components/marketing/styles'
import { TrackedLink } from '@/components/marketing/tracked-link'
import {
  HOME_CAPSTONES,
  SAMPLE_CERTIFICATE_LABEL,
  SAMPLE_CERTIFICATE_SRC,
  SAMPLE_LEARNER_NAME,
  SAMPLE_PORTFOLIO_PATH,
  padIndex,
} from '@/config/marketing'

/** Capstones shown in the drawn portfolio: brief, PRD, metrics. Real titles. */
const PORTFOLIO_CAPSTONE_NUMBERS = [1, 3, 6]

/**
 * Address shown in the drawn frame. A placeholder on purpose: it must not read as, or
 * resolve to, a real page. The real sample lives behind the link below the figure.
 */
const DRAWN_PORTFOLIO_URL = 'prodily…/p/your-name'

const FELLOW_POINTS = [
  'No fee, no shortcut.',
  'Every request is reviewed.',
  'The badge sits on your public portfolio.',
] as const

const CARD_TITLE =
  'text-h3 sm:text-[1.625rem] font-semibold tracking-[-0.015em] leading-tight text-foreground text-balance'
const CARD_BODY = 'text-body text-ink-muted leading-relaxed text-pretty max-w-[52ch]'

export function WhatYouLeaveWithSection() {
  return (
    <section
      id="leave-with"
      aria-labelledby="leave-with-heading"
      data-home-section="leave-with"
      className={`${BAND_MUTED} ${SECTION_Y}`}
    >
      <div className={CONTAINER}>
        <h2 id="leave-with-heading" className={SECTION_TITLE}>
          What you leave with.
        </h2>

        <div className="mt-12 grid gap-5 lg:mt-16 lg:grid-cols-12 lg:gap-6">
          <PortfolioCard />
          <CertificateCard />
          <FellowCard />
        </div>
      </div>
    </section>
  )
}

function PortfolioCard() {
  const capstones = HOME_CAPSTONES.filter((c) => PORTFOLIO_CAPSTONE_NUMBERS.includes(c.number))
  const initials = SAMPLE_LEARNER_NAME.split(' ')
    .map((part) => part[0])
    .join('')

  return (
    <article className={`${CARD} flex flex-col gap-8 p-6 sm:p-8 lg:col-span-7`}>
      <h3 className={CARD_TITLE}>One link that shows your product work.</h3>

      <figure className="mt-auto flex flex-col gap-3">
        <div
          aria-hidden="true"
          className="overflow-hidden rounded-md border border-border bg-background"
        >
          <div className="flex items-center gap-3 border-b border-border bg-surface-muted px-4 py-2.5">
            <div className="min-w-0 flex-1 truncate rounded-sm bg-surface px-3 py-1 font-mono text-caption text-ink-muted">
              {DRAWN_PORTFOLIO_URL}
            </div>
          </div>

          <div className="flex flex-col gap-6 p-5 sm:p-6">
            <div className="flex items-center gap-3">
              <span className="flex size-10 items-center justify-center rounded-full bg-primary-soft text-body-sm font-semibold text-primary">
                {initials}
              </span>
              <div className="flex flex-col">
                <span className="text-body font-semibold text-foreground">{SAMPLE_LEARNER_NAME}</span>
                <span className="text-caption text-ink-muted">Product portfolio</span>
              </div>
            </div>

            <ul className="flex flex-col divide-y divide-border border-y border-border">
              {capstones.map((capstone) => (
                <li key={capstone.number} className="flex items-center gap-4 py-3">
                  <span className="font-mono text-caption tabular-nums text-ink-muted">
                    {padIndex(capstone.number)}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-body-sm font-medium text-foreground">
                    {capstone.title}
                  </span>
                  <span
                    className="size-2 shrink-0 rounded-full"
                    style={{ backgroundColor: `var(--color-skill-${capstone.skill})` }}
                  />
                </li>
              ))}
            </ul>
          </div>
        </div>
        <IllustrationCaption as="figcaption" />
      </figure>

      <TrackedLink
        href={SAMPLE_PORTFOLIO_PATH}
        event="home_secondary_cta_click"
        args={{ location: 'leave_with', target: 'sample_portfolio' }}
        className={`${LINK_QUIET} self-start`}
      >
        See a real portfolio
        <ArrowRight aria-hidden="true" className={`size-4 ${ARROW_NUDGE}`} />
      </TrackedLink>
    </article>
  )
}

function CertificateCard() {
  return (
    <article className={`${CARD} flex flex-col gap-8 p-6 sm:p-8 lg:col-span-5`}>
      <div className="flex flex-col gap-3">
        <h3 className={CARD_TITLE}>A certificate anyone can check.</h3>
        <p className={CARD_BODY}>
          Finish all 90 lessons, add it to LinkedIn in one click, and share a public
          verification link.
        </p>
      </div>

      <figure className="mt-auto flex flex-col gap-3">
        <span className="self-start rounded-full border border-border bg-background px-3 py-1 text-caption font-semibold text-foreground">
          {SAMPLE_CERTIFICATE_LABEL}
        </span>
        <Image
          src={SAMPLE_CERTIFICATE_SRC}
          alt={`${SAMPLE_CERTIFICATE_LABEL} made out to ${SAMPLE_LEARNER_NAME}. Not a real credential.`}
          width={2200}
          height={1400}
          loading="lazy"
          sizes="(min-width: 1024px) 380px, calc(100vw - 5.5rem)"
          className="h-auto w-full rounded-md border border-border"
        />
        <figcaption className="text-body-sm text-ink-muted text-pretty">
          Every real certificate has a public link anyone can open.
        </figcaption>
      </figure>
    </article>
  )
}

function FellowCard() {
  return (
    <article
      className={`${CARD} grid gap-8 p-6 sm:p-8 md:grid-cols-[auto_minmax(0,1fr)] md:items-center md:gap-12 lg:col-span-12 lg:px-12 lg:py-10`}
    >
      <figure className="flex flex-col items-center gap-3 md:items-start">
        <FellowBadge />
        <IllustrationCaption as="figcaption" className="max-w-[24ch] text-center md:text-left" />
      </figure>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)] lg:gap-12">
        <div className="flex flex-col gap-3">
          <h3 className={CARD_TITLE}>PM Fellow. Earned, then reviewed.</h3>
          <p className={CARD_BODY}>
            Complete every item on the portfolio checklist and request review. A person on our
            team decides.
          </p>
        </div>
        <ul className="flex flex-col self-center border-t border-border">
          {FELLOW_POINTS.map((point) => (
            <li key={point} className="border-b border-border py-3.5 text-body font-medium text-foreground">
              {point}
            </li>
          ))}
        </ul>
      </div>
    </article>
  )
}

/** Drawn seal: two amber rings around "PM", with "Fellow" beneath. Decorative. */
function FellowBadge() {
  return (
    <div
      aria-hidden="true"
      className="flex size-36 items-center justify-center rounded-full border-2 border-accent bg-background p-2"
    >
      <div className="flex size-full flex-col items-center justify-center gap-1 rounded-full border border-dashed border-accent/60 bg-accent/10">
        <span className="text-[2.25rem] font-semibold leading-none tracking-[-0.03em] text-foreground">
          PM
        </span>
        <span className="text-micro font-semibold uppercase tracking-[0.18em] text-foreground">
          Fellow
        </span>
      </div>
    </div>
  )
}
