/**
 * Hero visual: one paper-style capstone page (static server component).
 *
 * This replaces a three-tab, auto-advancing product mock. The old mock showed the
 * founder as a learner, invented labels and scores the product does not have, and a
 * PRD tagged as Capstone 01 when the real Capstone 1 is the Opportunity Brief. Its
 * timer could not be paused on touch.
 *
 * What it shows now is the real Capstone 1 structure (title, module, and three of the
 * sections of its starter template, under their real template numbers) filled in with
 * demonstration text, credited to "Sample Learner". The template order is 1 Problem
 * Statement, 2 Target Persona, 3 JTBD, 4 Success Metrics; the persona is skipped here. The page is decorative for assistive tech: the drawing is
 * aria-hidden, one sr-only line describes it, and the visible caption says it is an
 * illustration. Nothing inside it is focusable.
 *
 * Motion is a single CSS entry fade on the hero side (see hero.tsx); this file has none.
 */

import { IllustrationCaption } from '@/components/marketing/illustration-caption'
import { HOME_CAPSTONES, SAMPLE_LEARNER_NAME, padIndex } from '@/config/marketing'

/**
 * Demonstration content, written to the Capstone 1 template headings. `number` is the
 * section's real position in the template (Target Persona, 2, is not shown).
 */
const SECTIONS = [
  {
    number: 1,
    heading: 'Problem statement',
    body: 'New workspace owners stall during setup. Many never invite a teammate, and most of those stop returning within their first two weeks.',
  },
  {
    number: 3,
    heading: 'Jobs to be done',
    body: 'When I set up a new workspace, I want my team working in it quickly, so that the switch feels worth it.',
  },
  {
    number: 4,
    heading: 'Success metrics',
    body: 'Primary: teammates invited in week one. Guardrail: support requests per new workspace.',
  },
] as const

export function HeroWorkbench() {
  const capstone = HOME_CAPSTONES[0]

  return (
    <figure className="relative">
      <p className="sr-only">
        Illustration of a capstone page: {capstone.title}, from Module {capstone.number},{' '}
        {capstone.moduleTitle}, written by {SAMPLE_LEARNER_NAME}.
      </p>

      <div aria-hidden="true" className="relative pb-3 pr-3">
        {/* A second sheet behind the page, offset, so it reads as one page of several. */}
        <div className="absolute inset-0 left-3 top-3 rounded-lg border border-border bg-background" />

        <div className="relative rounded-lg border border-border bg-surface p-6 sm:p-8 lg:p-10">
          <div className="flex items-baseline justify-between gap-4 border-b border-border pb-5">
            <p className="text-body-sm text-ink-muted">
              <span className="font-semibold text-foreground">Capstone {padIndex(capstone.number)}</span>
              <span className="mx-2 text-border-strong">/</span>
              Module {capstone.number}, {capstone.moduleTitle}
            </p>
            <span className="hidden shrink-0 rounded-full border border-border px-2.5 py-0.5 text-caption font-semibold text-primary sm:inline">
              Public
            </span>
          </div>

          <p className="mt-6 font-sans text-[clamp(1.375rem,2.2vw,1.75rem)] font-semibold leading-[1.2] tracking-[-0.015em] text-foreground text-balance">
            {capstone.title}
          </p>
          <p className="mt-3 text-body-sm text-ink-muted">By {SAMPLE_LEARNER_NAME}</p>

          <ul className="mt-8 space-y-6">
            {SECTIONS.map((section) => (
              <li key={section.heading} className="grid grid-cols-[1.75rem_1fr] gap-x-2">
                <span className="text-body-sm font-semibold tabular-nums text-primary">
                  {section.number}.
                </span>
                <div>
                  <p className="text-body-sm font-semibold text-foreground">{section.heading}</p>
                  <p className="mt-1.5 text-body-sm leading-relaxed text-ink-muted text-pretty">
                    {section.body}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <IllustrationCaption as="figcaption" className="mt-3" />
    </figure>
  )
}
