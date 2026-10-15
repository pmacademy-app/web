/**
 * "What you leave with": the three things a learner keeps after the course.
 *
 * 1. Portfolio page: a drawn page frame under the sample name with the PM Fellow badge
 *    state and three real capstones (module, title, deliverable type, skill). The skill
 *    radar and the "See a real portfolio" link each live in their own section, so they
 *    are not repeated here.
 * 2. Certificate: the exported sample render, labelled as a sample. It deliberately
 *    has no verification link, because a sample has nothing to verify.
 * 3. PM Fellow: a distinction a person on the team grants on request. Not an
 *    automated score; the copy says only what lib/fellow.ts does.
 *
 * ## Layout and depth (round 2)
 *
 * Bento of 7 / 5 / 12 columns from `lg`, one column below it. Every tile is a double
 * bezel (SHELL around a SHELL_CORE). The cores are SPOTLIGHT cards in one
 * SpotlightGroup; the certificate image carries GLARE on its own wrapper; the Fellow
 * tray carries CONIC_BORDER. Each effect sits on a different element or pseudo-element
 * (spotlight ::before on the core, conic ::after on the tray, glare ::after on the
 * image wrapper).
 *
 * ## Narrow screens
 *
 * At 375px these cards used to render 518px wide because grid tracks defaulted to
 * min-content. The grid is now `grid-cols-1` (minmax(0,1fr)), every tile and inner
 * flex/grid child has `min-w-0`, and long strings wrap or truncate.
 *
 * Server component. The only client piece is SpotlightGroup.
 */

import Image from 'next/image'
import { Sparkles } from 'lucide-react'

import { IllustrationCaption } from '@/components/marketing/illustration-caption'
import { SpotlightGroup } from '@/components/marketing/spotlight-group'
import {
  BAND_MUTED,
  CONIC_BORDER,
  CONTAINER,
  GLARE,
  SECTION_TITLE,
  SECTION_Y,
  SHELL,
  SHELL_CORE,
  SPOTLIGHT,
} from '@/components/marketing/styles'
import {
  HOME_CAPSTONES,
  SAMPLE_CERTIFICATE_LABEL,
  SAMPLE_CERTIFICATE_SRC,
  SAMPLE_LEARNER_NAME,
  padIndex,
} from '@/config/marketing'
import { BRAND } from '@/lib/brand'
import { SKILL_LABELS } from '@/lib/design/tokens'

/**
 * Capstones shown in the drawn portfolio. Real titles, chosen so they do not repeat
 * the capstones drawn elsewhere on the page (the hero shows 1, the loop's Apply step 3).
 */
const PORTFOLIO_CAPSTONE_NUMBERS = [2, 5, 9]

/**
 * Address shown in the drawn frame. The `your-name` slug is a placeholder on purpose:
 * it must not read as a specific real learner's page.
 */
const DRAWN_PORTFOLIO_URL = `${BRAND.domain}/p/your-name`

const FELLOW_POINTS = [
  'No fee, no shortcut.',
  'A person on our team decides.',
  'The badge sits on your public portfolio.',
] as const

const CARD_TITLE =
  'text-h3 sm:text-[1.625rem] font-semibold tracking-[-0.015em] leading-tight text-foreground text-balance break-words'
const CARD_BODY = 'text-body text-ink-muted leading-relaxed text-pretty max-w-[52ch]'

/** Inner padding shared by the bento cores. */
const CORE_PAD = 'p-5 sm:p-7 lg:p-8'

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

        <SpotlightGroup className="mt-10 grid grid-cols-1 gap-4 lg:mt-14 lg:grid-cols-12 lg:gap-5">
          <PortfolioCard />
          <CertificateCard />
          <FellowCard />
        </SpotlightGroup>
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
    <article className={`${SHELL} lg:col-span-7`}>
      <div
        data-spotlight
        className={`${SHELL_CORE} ${SPOTLIGHT} flex h-full flex-col gap-6 ${CORE_PAD}`}
      >
        <h3 className={CARD_TITLE}>One link that shows your product work.</h3>

        <figure className="flex min-w-0 flex-1 flex-col gap-3">
          <p className="sr-only">
            Drawn example of a public portfolio page for {SAMPLE_LEARNER_NAME}, showing the PM
            Fellow badge and three capstone titles from the curriculum.
          </p>
          <div
            aria-hidden="true"
            className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-background"
          >
            <div className="flex min-w-0 items-center gap-3 border-b border-border bg-surface-muted px-3 py-2 sm:px-4">
              <div className="min-w-0 flex-1 truncate rounded-full bg-surface px-3 py-1 font-sans text-caption tabular-nums text-ink-muted">
                {DRAWN_PORTFOLIO_URL}
              </div>
            </div>

            <div className="flex min-w-0 flex-1 flex-col gap-4 p-4 sm:p-5">
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary-soft text-body-sm font-semibold text-primary">
                  {initials}
                </span>
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-body font-semibold text-foreground">
                    {SAMPLE_LEARNER_NAME}
                  </span>
                  <span className="truncate text-caption text-ink-muted">Product portfolio</span>
                </div>
              </div>

              <div className="flex min-w-0 items-center gap-3 rounded-lg border border-accent/50 bg-accent/10 px-3 py-2.5">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full border border-accent bg-background">
                  <Sparkles size={14} strokeWidth={1.75} className="text-foreground" />
                </span>
                <span className="flex min-w-0 flex-col">
                  <span className="text-body-sm font-semibold text-foreground">PM Fellow</span>
                </span>
              </div>

              <ul className="flex min-w-0 flex-col gap-2">
                {capstones.map((capstone) => (
                  <li
                    key={capstone.number}
                    className="flex min-w-0 items-stretch gap-3 rounded-lg border border-border bg-surface px-3 py-2.5"
                  >
                    <span
                      className="w-1 shrink-0 rounded-full"
                      style={{ backgroundColor: `var(--color-skill-${capstone.skill})` }}
                    />
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="truncate text-caption text-ink-muted">
                        <span className="font-sans tabular-nums">{padIndex(capstone.number)}</span>
                        {' '}
                        {capstone.moduleTitle}
                      </span>
                      <span className="line-clamp-2 break-words text-body-sm font-medium leading-snug text-foreground">
                        {capstone.title}
                      </span>
                      <span className="mt-1 flex min-w-0 flex-wrap gap-1.5">
                        <span className="max-w-full truncate rounded-full bg-surface-muted px-2 py-0.5 text-micro font-medium text-foreground">
                          {capstone.deliverableType}
                        </span>
                        <span className="max-w-full truncate rounded-full border border-border px-2 py-0.5 text-micro font-medium text-ink-muted">
                          {SKILL_LABELS[capstone.skill]}
                        </span>
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <IllustrationCaption as="figcaption" />
        </figure>
      </div>
    </article>
  )
}

function CertificateCard() {
  return (
    <article className={`${SHELL} lg:col-span-5`}>
      <div
        data-spotlight
        className={`${SHELL_CORE} ${SPOTLIGHT} flex h-full flex-col gap-6 ${CORE_PAD}`}
      >
        <div className="flex min-w-0 flex-col gap-3">
          <h3 className={CARD_TITLE}>A certificate anyone can check.</h3>
          <p className={CARD_BODY}>
            Finish every lesson, add it to LinkedIn in one click, and share a public
            verification link.
          </p>
        </div>

        <figure className="flex min-w-0 flex-col gap-3">
          <span className="self-start rounded-full border border-border bg-background px-3 py-1 text-caption font-semibold text-foreground">
            {SAMPLE_CERTIFICATE_LABEL}
          </span>
          <div className={`${GLARE} rounded-xl border border-border shadow-tinted`}>
            <Image
              src={SAMPLE_CERTIFICATE_SRC}
              alt={`${SAMPLE_CERTIFICATE_LABEL} made out to ${SAMPLE_LEARNER_NAME}. Not a real credential.`}
              width={2200}
              height={1400}
              loading="lazy"
              sizes="(min-width: 1024px) 400px, calc(100vw - 4.5rem)"
              className="block h-auto w-full"
            />
          </div>
          <figcaption className="text-body-sm text-ink-muted text-pretty">
            Every real certificate has a public link anyone can open.
          </figcaption>
        </figure>
      </div>
    </article>
  )
}

function FellowCard() {
  return (
    <article className={`${SHELL} ${CONIC_BORDER} lg:col-span-12`}>
      <div
        data-spotlight
        className={`${SHELL_CORE} ${SPOTLIGHT} grid grid-cols-1 gap-8 ${CORE_PAD} md:grid-cols-[auto_minmax(0,1fr)] md:items-center md:gap-12 lg:px-12 lg:py-10`}
      >
        <figure className="flex min-w-0 flex-col items-center gap-3 md:items-start">
          <FellowBadge />
          <IllustrationCaption as="figcaption" className="max-w-[24ch] text-center md:text-left" />
        </figure>

        <div className="grid min-w-0 grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)] lg:gap-12">
          <div className="flex min-w-0 flex-col gap-3">
            <h3 className={CARD_TITLE}>PM Fellow. Earned, then reviewed.</h3>
            <p className={CARD_BODY}>
              Complete every item on the portfolio checklist and request review.
            </p>
          </div>
          <ul className="flex min-w-0 flex-col self-center border-t border-border">
            {FELLOW_POINTS.map((point) => (
              <li
                key={point}
                className="border-b border-border py-3.5 text-body font-medium text-foreground break-words"
              >
                {point}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </article>
  )
}

/** Drawn seal: two amber rings around "PM", with "Fellow" beneath. Decorative. */
function FellowBadge() {
  return (
    <div
      aria-hidden="true"
      className="flex size-36 items-center justify-center rounded-full border-2 border-accent bg-background p-2 shadow-tinted"
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
