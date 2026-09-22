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
      className="py-20 lg:py-28 bg-white border-t border-[#DED8CB]/80 scroll-mt-24 lg:scroll-mt-28"
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
          <p className="text-base sm:text-lg text-[#70685A] leading-relaxed">
            Every applied capstone becomes a tangible product artifact, from PRDs and opportunity briefs to roadmaps, metrics work, and strategy case studies. Publish your strongest work to a public portfolio and give people something concrete to see.
          </p>
        </div>

        {/* ── Single Sliding PPT-Style Showcase Card ────────────────────── */}
        <PortfolioShowcase />

      </div>
    </section>
  )
}
