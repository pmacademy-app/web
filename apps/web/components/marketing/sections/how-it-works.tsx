import type { ReactNode } from 'react'
import { ArrowRight, Check } from 'lucide-react'

import { IllustrationCaption } from '@/components/marketing/illustration-caption'
import { Reveal } from '@/components/marketing/motion/reveal'
import {
  ARROW_NUDGE,
  BAND_PLAIN,
  CONTAINER,
  LINK_QUIET,
  NUMERAL,
  SECTION_LEAD,
  SECTION_TITLE,
  SECTION_Y,
} from '@/components/marketing/styles'
import { TrackedLink } from '@/components/marketing/tracked-link'
import { HOME_CAPSTONES, SAMPLE_LEARNER_NAME, padIndex } from '@/config/marketing'

/**
 * The learning loop: read, recall, apply, retain.
 *
 * ## Layout
 *
 * A numbered verb method. Each step is one row: a large numeral, the verb and one line
 * on the left, and a small drawn visual of that step on the right. On desktop both
 * columns are `position: sticky` inside a step that is taller than its content, so the
 * step holds still while you read it and the next step slides up and replaces it. That
 * gives the "visual changes per step" effect with no JavaScript and no observer: every
 * step renders its own visual, so without CSS sticky support (or on a phone, where the
 * visual simply sits under its step) all four are still there, in order.
 *
 * Sticky only works while no ancestor sets `overflow: hidden|auto`; the marketing layout
 * does not.
 *
 * ## Honesty
 *
 * The visuals are illustrations, captioned as such, hidden from assistive technology
 * and described once in screen-reader text. They show structure, never scores. Every
 * step names a mechanic that ships today (`blocks/quiz`, `lib/srs.ts`,
 * `config/capstones.ts`, `/review`, `lib/streaks/streaks.ts`).
 */

interface LoopStep {
  verb: string
  line: string
  /** Screen-reader description of the illustration. */
  description: string
  visual: ReactNode
}

/** Capstone 3 (the PRD), so this mock differs from the hero's Capstone 1 page. */
const APPLY_CAPSTONE = HOME_CAPSTONES.find((c) => c.number === 3)

const LOOP: LoopStep[] = [
  {
    verb: 'Read',
    line: 'A concept explained from first principles, with a worked example.',
    description:
      'Illustration of a lesson page: a heading, a few paragraphs and a worked example box.',
    visual: <ReadVisual />,
  },
  {
    verb: 'Recall',
    line: 'Scenario quizzes that explain every answer, right or wrong.',
    description:
      'Illustration of a quiz question with four options, one chosen, and an explanation underneath.',
    visual: <RecallVisual />,
  },
  {
    verb: 'Apply',
    line: 'Write the module capstone and keep it in your portfolio.',
    description: `Illustration of a capstone document titled ${APPLY_CAPSTONE?.title ?? 'Product Requirements Document'}, written by ${SAMPLE_LEARNER_NAME}.`,
    visual: <ApplyVisual />,
  },
  {
    verb: 'Retain',
    line: 'Short reviews return just before you would forget. A few minutes a day.',
    description: 'Illustration of a small stack of review cards, with one card face up.',
    visual: <RetainVisual />,
  },
]

const HABITS: { label: ReactNode; line: string }[] = [
  { label: 'Streaks.', line: 'A daily habit, with freezes for off days.' },
  { label: 'Badges.', line: 'Marks for real milestones.' },
  { label: 'Leaderboard.', line: 'Optional, weekly.' },
  {
    label: (
      <>
        <TrackedLink
          href="/glossary"
          event="home_secondary_cta_click"
          args={{ location: 'how_it_works', target: 'glossary' }}
          className="rounded-sm underline decoration-primary/40 underline-offset-4 hover:text-primary hover:decoration-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          Glossary
        </TrackedLink>{' '}
        and{' '}
        <TrackedLink
          href="/frameworks"
          event="home_secondary_cta_click"
          args={{ location: 'how_it_works', target: 'frameworks' }}
          className="rounded-sm underline decoration-primary/40 underline-offset-4 hover:text-primary hover:decoration-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          frameworks
        </TrackedLink>
        .
      </>
    ),
    line: 'Look up any term.',
  },
]

export function HowItWorksSection() {
  return (
    <section
      id="how-it-works"
      aria-labelledby="how-it-works-heading"
      data-home-section="how-it-works"
      className={`${BAND_PLAIN} ${SECTION_Y} scroll-mt-24 lg:scroll-mt-28`}
    >
      <div className={CONTAINER}>
        <Reveal amount={0.25} className="mb-12 lg:mb-20">
          <h2 id="how-it-works-heading" className={`${SECTION_TITLE} mb-4`}>
            Read, recall, apply, retain.
          </h2>
          <p className={SECTION_LEAD}>
            Four steps. The last one brings you back.
          </p>
        </Reveal>

        <ol className="space-y-16 lg:space-y-0">
          {LOOP.map((step, index) => (
            <li
              key={step.verb}
              className="grid grid-cols-1 gap-8 lg:min-h-[34rem] lg:grid-cols-12 lg:gap-12 lg:border-t lg:border-border lg:pt-12"
            >
              <div className="lg:sticky lg:top-32 lg:col-span-5 lg:self-start">
                <span aria-hidden="true" className={`${NUMERAL} block`}>
                  {padIndex(index + 1)}
                </span>
                <h3 className="mt-5 font-sans text-[clamp(1.5rem,2.6vw,2rem)] font-semibold leading-tight tracking-[-0.015em] text-foreground">
                  {step.verb}.
                </h3>
                <p className="mt-3 max-w-[36ch] text-body sm:text-body-lg leading-relaxed text-ink-muted text-pretty">
                  {step.line}
                </p>
              </div>

              <figure className="lg:sticky lg:top-32 lg:col-span-7 lg:self-start">
                <div
                  aria-hidden="true"
                  className="flex aspect-[4/3] items-center justify-center rounded-lg border border-border bg-surface-muted p-6 sm:p-10 lg:aspect-[3/2] lg:p-8"
                >
                  {step.visual}
                </div>
                <p className="sr-only">{step.description}</p>
                <IllustrationCaption as="figcaption" className="mt-3" />
              </figure>
            </li>
          ))}
        </ol>

        <ul className="mt-16 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:mt-20 lg:grid-cols-4">
          {HABITS.map((habit, index) => (
            <li
              key={index}
              className="rounded-lg border border-border bg-surface px-4 py-3.5 text-body-sm leading-snug text-ink-muted"
            >
              <span className="font-semibold text-foreground">{habit.label}</span>{' '}
              {habit.line}
            </li>
          ))}
        </ul>

        <div className="mt-8">
          <TrackedLink
            href="/curriculum"
            event="home_secondary_cta_click"
            args={{ location: 'how_it_works', target: 'curriculum' }}
            className={LINK_QUIET}
          >
            View the curriculum
            <ArrowRight size={15} aria-hidden="true" className={ARROW_NUDGE} />
          </TrackedLink>
        </div>
      </div>
    </section>
  )
}

/* ---------------------------------------------------------------------------------
 * Step visuals. Simple drawn mocks: a paper surface on the muted panel, text bars for
 * prose, and real words only where they carry the idea. No scores, no metrics.
 * ------------------------------------------------------------------------------ */

const PAPER = 'w-full max-w-[26rem] rounded-md border border-border bg-surface p-5 sm:p-6'
const BAR = 'h-2 rounded-full bg-border'

function Lines({ widths }: { widths: string[] }) {
  return (
    <div className="space-y-2">
      {widths.map((w, i) => (
        <div key={i} className={`${BAR} ${w}`} />
      ))}
    </div>
  )
}

function ReadVisual() {
  return (
    <div className={PAPER}>
      <p className="text-caption font-semibold text-primary">Lesson</p>
      <p className="mt-2 font-sans text-lg font-semibold leading-snug tracking-[-0.015em] text-foreground">
        Why this lesson matters
      </p>
      <div className="mt-4">
        <Lines widths={['w-full', 'w-11/12', 'w-5/6']} />
      </div>
      <div className="mt-5 rounded-md border-l-2 border-primary bg-primary-soft px-4 py-3">
        <p className="text-caption font-semibold text-primary">Worked example</p>
        <div className="mt-2">
          <Lines widths={['w-full', 'w-3/4']} />
        </div>
      </div>
    </div>
  )
}

function RecallVisual() {
  const options = ['w-3/4', 'w-2/3', 'w-5/6', 'w-1/2']
  return (
    <div className={PAPER}>
      <p className="text-caption font-semibold text-primary">Scenario</p>
      <div className="mt-3">
        <Lines widths={['w-full', 'w-5/6']} />
      </div>
      <ul className="mt-5 space-y-2">
        {options.map((w, i) => {
          const chosen = i === 2
          return (
            <li
              key={i}
              className={`flex items-center gap-3 rounded-md border px-3 py-2.5 ${
                chosen ? 'border-primary bg-primary-soft' : 'border-border'
              }`}
            >
              <span
                className={`flex size-4 shrink-0 items-center justify-center rounded-full border ${
                  chosen ? 'border-primary bg-primary text-primary-foreground' : 'border-border-strong'
                }`}
              >
                {chosen && <Check size={10} strokeWidth={3} />}
              </span>
              <span className={`${BAR} ${w}`} />
            </li>
          )
        })}
      </ul>
      <div className="mt-4 border-t border-border pt-3">
        <p className="text-caption font-semibold text-foreground">Why this answer</p>
        <div className="mt-2">
          <Lines widths={['w-full', 'w-2/3']} />
        </div>
      </div>
    </div>
  )
}

function ApplyVisual() {
  return (
    <div className={PAPER}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-caption font-semibold text-primary">Capstone {padIndex(APPLY_CAPSTONE?.number ?? 3)}</p>
        <p className="text-caption text-ink-muted">{SAMPLE_LEARNER_NAME}</p>
      </div>
      <p className="mt-2 font-sans text-lg font-semibold leading-snug tracking-[-0.015em] text-foreground text-balance">
        {APPLY_CAPSTONE?.title ?? 'Product Requirements Document'}
      </p>
      {['In-Scope & Out-of-Scope', 'User Stories & Acceptance Criteria', 'Edge Cases & Error Handling'].map((heading) => (
        <div key={heading} className="mt-4">
          <p className="text-caption font-semibold text-foreground">{heading}</p>
          <div className="mt-2">
            <Lines widths={['w-full', 'w-5/6']} />
          </div>
        </div>
      ))}
      <p className="mt-5 inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-caption text-ink-muted">
        <Check size={12} className="text-primary" />
        In your portfolio
      </p>
    </div>
  )
}

function RetainVisual() {
  return (
    <div className="relative w-full max-w-[24rem] pt-6">
      {/* Two cards behind, offset, to read as a stack. */}
      <div className="absolute inset-x-8 top-0 h-full rounded-md border border-border bg-surface/60" />
      <div className="absolute inset-x-4 top-3 h-full rounded-md border border-border bg-surface/80" />
      <div className={`relative ${PAPER} max-w-none`}>
        <div className="flex items-center justify-between gap-3">
          <p className="text-caption font-semibold text-primary">Review</p>
          <p className="inline-flex items-center gap-1.5 text-caption text-ink-muted">
            <span className="size-1.5 rounded-full bg-accent" />
            Due today
          </p>
        </div>
        <div className="mt-4">
          <Lines widths={['w-full', 'w-7/12']} />
        </div>
        <div className="mt-6 flex justify-end">
          <span className="rounded-full border border-border px-3 py-1 text-caption font-semibold text-foreground">
            Reveal answer
          </span>
        </div>
      </div>
    </div>
  )
}
