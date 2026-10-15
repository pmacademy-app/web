/**
 * Hero visual: a layered "Z-axis cascade" of three drawn artefacts (server component).
 *
 * 1. The back layer is one capstone page: the real Capstone 1 title and module, and two
 *    sections of its starter template (Problem Statement, JTBD), filled in with
 *    demonstration text credited to "Sample Learner". From md up a second sheet peeks
 *    out behind it so it reads as one page of several.
 * 2. A small portfolio card overlaps the bottom left: a URL bar on the site's own
 *    domain with a placeholder handle ("your-name"), and one skill-coloured bar per
 *    capstone (no titles; the capstone list belongs to its own section). The
 *    placeholder is deliberate: the mock is credited to Sample Learner, so it must not
 *    point at a real learner's portfolio.
 * 3. A mini Skill Radar card overlaps the right edge (SkillRadar is server-safe; the
 *    values are SKILL_RADAR_DEMO, drawn without numbers or a legend).
 *
 * Depth: every artefact uses the double bezel (SHELL + SHELL_CORE) with tinted
 * shadows. From md up the whole stage tilts in 3D (perspective 1200px, rotateX 6deg,
 * rotateY -10deg) and eases flat on hover over 600ms; transform only. Under reduced
 * motion the tilt stays (it is static) but hover no longer animates it. Below md there
 * is no rotation, no absolute positioning and no overlap: the back sheet is hidden and
 * the two small cards sit in a row below the page, so no text is covered and nothing
 * can push the 375px layout sideways. Between md and
 * lg the stage is capped at 38rem and centred so the overlapping cards stay on screen.
 *
 * Accessibility: the drawing is aria-hidden (including SkillRadar's own sr summary),
 * one sr-only line describes it, and the visible caption says it is an illustration.
 * Nothing inside is focusable.
 */

import { Link2 } from 'lucide-react'

import { IllustrationCaption } from '@/components/marketing/illustration-caption'
import { SkillRadar } from '@/components/marketing/product-mockup/skill-radar'
import { SHADOW_TINTED_LG, SHELL, SHELL_CORE } from '@/components/marketing/styles'
import { SKILL_RADAR_DEMO } from '@/config/content'
import { HOME_CAPSTONES, SAMPLE_LEARNER_NAME, padIndex } from '@/config/marketing'
import { BRAND } from '@/lib/brand'

/**
 * Demonstration content, written to the Capstone 1 template headings. Two sections
 * only, so the hero holds to one screen.
 */
const SECTIONS = [
  {
    heading: 'Problem statement',
    body: 'New workspace owners stall during setup. Many never invite a teammate, and most of those stop returning within their first two weeks.',
  },
  {
    heading: 'Jobs to be done',
    body: 'When I set up a new workspace, I want my team working in it quickly, so that the switch feels worth it.',
  },
] as const

/** Placeholder handle in the drawn URL bar. Not a real portfolio. */
const PORTFOLIO_HANDLE = 'your-name'

/** md+ tilt for the stage. Eases flat on hover; static and flat under reduced motion. */
const STAGE_TILT = `
  md:[transform-style:preserve-3d]
  md:[transform:rotateX(6deg)_rotateY(-10deg)]
  md:group-hover/stage:[transform:rotateX(0deg)_rotateY(0deg)]
  md:transition-transform md:duration-[600ms] md:ease-out-quint
  motion-reduce:md:transition-none
  motion-reduce:md:group-hover/stage:[transform:rotateX(6deg)_rotateY(-10deg)]
`

export function HeroWorkbench() {
  const capstone = HOME_CAPSTONES[0]

  return (
    <figure className="relative min-w-0 md:max-lg:mx-auto md:max-lg:max-w-[38rem]">
      <p className="sr-only">
        Illustration of a capstone page: {capstone.title}, from Module {capstone.number},{' '}
        {capstone.moduleTitle}, written by {SAMPLE_LEARNER_NAME}. Beside it, a public
        portfolio card and a Skill Radar chart.
      </p>

      <div aria-hidden="true" className="group/stage relative min-w-0 md:[perspective:1200px]">
        <div className={`relative min-w-0 md:pb-24 md:pr-10 lg:pr-12 ${STAGE_TILT}`}>
          {/* Back sheet: a second page offset behind the first. */}
          <div
            className={`absolute inset-x-6 -top-3 bottom-6 rounded-[1.5rem] bg-surface/70 ring-1 ring-border max-md:hidden md:bottom-28 md:left-8 md:right-14 lg:right-16`}
          />

          {/* Layer 1: the capstone page. */}
          <div className={`relative ${SHELL}`}>
            <div className={`${SHELL_CORE} p-5 sm:p-7 md:pb-28`}>
              <div className="flex items-center justify-between gap-3 border-b border-border/70 pb-4">
                <p className="min-w-0 truncate text-caption text-ink-muted">
                  <span className="font-semibold text-foreground">
                    Capstone {padIndex(capstone.number)}
                  </span>
                  <span className="mx-1.5 text-border-strong">/</span>
                  Module {capstone.number}, {capstone.moduleTitle}
                </p>
                <span className="shrink-0 rounded-full bg-primary-soft px-2.5 py-0.5 text-caption font-semibold text-primary">
                  Public
                </span>
              </div>

              <p className="mt-5 text-[clamp(1.25rem,2vw,1.5rem)] font-semibold leading-[1.2] tracking-[-0.02em] text-foreground text-balance">
                {capstone.title}
              </p>
              <p className="mt-2 text-body-sm text-ink-muted">By {SAMPLE_LEARNER_NAME}</p>

              <ul className="mt-6 space-y-4 md:pr-32 lg:pr-24">
                {SECTIONS.map((section) => (
                  <li key={section.heading} className="min-w-0 border-l-2 border-primary/40 pl-3">
                    <p className="text-body-sm font-semibold text-foreground">{section.heading}</p>
                    <p className="mt-1 text-body-sm leading-relaxed text-ink-muted text-pretty">
                      {section.body}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/*
            Layers 2 and 3. Below md: a two-card row below the page, no overlap.
            From md: `contents`, so each card positions against the stage instead.
          */}
          <div className="relative z-10 mt-3 grid grid-cols-[minmax(0,1fr)_auto] items-end gap-2 px-1 sm:gap-3 sm:px-3 md:contents">
            {/* Layer 2: public portfolio card. */}
            <div
              className={`min-w-0 md:absolute md:bottom-0 md:left-0 md:w-[21.5rem] md:-translate-x-4 md:[transform:translateZ(40px)] lg:-translate-x-8 ${SHELL} ${SHADOW_TINTED_LG}`}
            >
              <div className={`${SHELL_CORE} p-3 sm:p-4`}>
                <div className="flex min-w-0 items-center gap-2 rounded-full bg-surface-muted px-3 py-1.5">
                  <Link2 size={12} strokeWidth={2} className="shrink-0 text-primary" />
                  <p className="min-w-0 truncate text-caption text-ink-muted">
                    <span className="hidden sm:inline">{BRAND.domain}</span>/p/
                    <span className="font-semibold text-foreground">{PORTFOLIO_HANDLE}</span>
                  </p>
                </div>
                <p className="mt-3 text-caption font-semibold text-foreground">Public portfolio</p>
                <div className="mt-3 flex items-end gap-1">
                  {HOME_CAPSTONES.map((row) => (
                    <span
                      key={row.number}
                      className="h-2 min-w-0 flex-1 rounded-full"
                      style={{ backgroundColor: `var(--color-skill-${row.skill})` }}
                    />
                  ))}
                </div>
              </div>
            </div>

            {/* Layer 3: mini Skill Radar card. */}
            <div
              className={`md:absolute md:right-0 md:top-1/3 md:[transform:translateZ(70px)] ${SHELL} ${SHADOW_TINTED_LG}`}
            >
              <div className={`${SHELL_CORE} flex flex-col items-center px-3 pb-3 pt-2.5`}>
                <p className="self-start text-caption font-semibold text-foreground">Skill Radar</p>
                <SkillRadar
                  values={SKILL_RADAR_DEMO.after}
                  previousValues={SKILL_RADAR_DEMO.before}
                  size={124}
                  showLegend={false}
                  className="gap-0 max-sm:[&_svg]:size-[5.5rem]"
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      <IllustrationCaption as="figcaption" className="mt-4 md:mt-6 md:pr-10 md:text-right lg:pr-12" />
    </figure>
  )
}
