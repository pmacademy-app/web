/**
 * Landing page portfolio section (B12-B — server component).
 *
 * The section header — eyebrow, h2, lede — is static copy that was sitting inside a
 * `'use client'` module only because the carousel below it needed state. Splitting the
 * two moves all of that text to the server and leaves `PortfolioShowcase` as the single
 * client island, which is what the batch's objective ("extract the animated wrappers so
 * the section bodies become server components") asks for.
 *
 * The artifact data moved to `portfolio-artifacts.ts` so both halves can import it
 * without dragging the carousel's hooks across the boundary.
 */

import { PortfolioShowcase } from '@/components/marketing/sections/portfolio-showcase'
import { Reveal } from '@/components/marketing/motion/reveal'
import {
  CONTAINER,
  EYEBROW,
  EYEBROW_RULE,
  SECTION_LEAD,
  SECTION_TITLE,
  SECTION_Y,
} from '@/components/marketing/styles'

export function PortfolioSection() {
  return (
    <section
      id="portfolio"
      aria-labelledby="portfolio-heading"
      className={`${SECTION_Y} bg-surface border-t border-border/80 scroll-mt-24 lg:scroll-mt-28`}
    >
      <div className={`${CONTAINER} space-y-12`}>

        {/* ── Section Header ────────────────────────────────────────────── */}
        <Reveal amount={0.25} className="max-w-3xl">
          <div className={`${EYEBROW} mb-4`}>
            <span aria-hidden="true" className={EYEBROW_RULE} />
            PROOF OF WORK
          </div>
          <h2
            id="portfolio-heading"
            className={`${SECTION_TITLE} mb-4`}
          >
            Finish with work you can show, not just a course you completed.
          </h2>
          <p className={SECTION_LEAD}>
            Every capstone produces a real product artifact: opportunity briefs, PRDs,
            roadmaps, metrics work, strategy case studies. Publish your strongest pieces
            and give people something concrete to look at.
          </p>
        </Reveal>

        {/* ── Single Sliding PPT-Style Showcase Card ────────────────────── */}
        <Reveal amount={0.15}>
          <PortfolioShowcase />
        </Reveal>

        {/* ── What you leave with ───────────────────────────────────────────
            The audit found the two shipping outcome surfaces — the public portfolio at
            /p/[username] and the verified certificate at /verify/[id] — were never
            mentioned on the homepage. Three short facts, no new section. */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-px bg-border rounded-xl overflow-hidden border border-border">
          {[
            {
              title: 'Nine capstone artifacts',
              body: 'One applied deliverable per module, written to a real brief with stated requirements.',
            },
            {
              title: 'A public portfolio page',
              body: 'Your own URL, showing the work you choose to publish. Private until you decide otherwise.',
            },
            {
              title: 'A verifiable certificate',
              body: 'Issued on completion, with a public verification link anyone can check.',
            },
          ].map((item, index) => (
            <Reveal key={item.title} amount={0.3} delay={index * 70} className="bg-surface p-6 lg:p-7 space-y-1.5">
              <h3 className="text-body font-semibold text-foreground">{item.title}</h3>
              <p className="text-sm text-ink-muted leading-relaxed">{item.body}</p>
            </Reveal>
          ))}
        </div>

      </div>
    </section>
  )
}
