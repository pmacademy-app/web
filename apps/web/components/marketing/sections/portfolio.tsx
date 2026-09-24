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

export function PortfolioSection() {
  return (
    <section
      id="portfolio"
      aria-labelledby="portfolio-heading"
      className="py-20 lg:py-28 bg-surface border-t border-border/80 scroll-mt-24 lg:scroll-mt-28"
    >
      <div className="max-w-[1120px] mx-auto px-5 lg:px-8 space-y-10">

        {/* ── Section Header ────────────────────────────────────────────── */}
        <div className="max-w-3xl space-y-3">
          <div className="text-xs font-mono font-semibold uppercase tracking-wider text-primary">
            PROOF OF WORK
          </div>
          <h2
            id="portfolio-heading"
            className="text-3xl sm:text-4xl lg:text-[2.75rem] font-semibold text-foreground tracking-[-0.03em] leading-tight"
          >
            Finish with work you can show, not just a course you completed.
          </h2>
          <p className="text-base sm:text-lg text-locked leading-relaxed">
            Every capstone produces a real product artifact: opportunity briefs, PRDs,
            roadmaps, metrics work, strategy case studies. Publish your strongest pieces
            and give people something concrete to look at.
          </p>
        </div>

        {/* ── Single Sliding PPT-Style Showcase Card ────────────────────── */}
        <PortfolioShowcase />

        {/* ── What you leave with ───────────────────────────────────────────
            The audit found the two shipping outcome surfaces — the public portfolio at
            /p/[username] and the verified certificate at /verify/[id] — were never
            mentioned on the homepage. Three short facts, no new section. */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-px bg-border rounded-sm overflow-hidden border border-border">
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
          ].map((item) => (
            <div key={item.title} className="bg-surface p-6 space-y-1.5">
              <h3 className="text-sm font-semibold text-foreground">{item.title}</h3>
              <p className="text-sm text-locked leading-relaxed">{item.body}</p>
            </div>
          ))}
        </div>

      </div>
    </section>
  )
}
