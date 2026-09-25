import { BookOpen, Layers, PenTool, RotateCw } from 'lucide-react'

import { Reveal } from '@/components/marketing/motion/reveal'
import {
  CONTAINER,
  EYEBROW,
  EYEBROW_RULE,
  SECTION_LEAD,
  SECTION_TITLE,
  SECTION_Y,
} from '@/components/marketing/styles'

/**
 * How the learning works — Phase 0.C.
 *
 * ## What this replaces and why
 *
 * `experience.tsx` is 453 lines of client component: five auto-cycling formats on a
 * 3.8 s timer, a live quiz demo and a flippable flashcard. It is well built, and it was
 * carrying the page's entire explanatory load through interaction — which is exactly the
 * density the Phase 0.C audit flagged. A visitor deciding whether to sign up does not
 * need to operate a demo; they need to understand the loop in one read.
 *
 * So this is four steps, server-rendered, no timers, no state. `experience.tsx` is left
 * in the repository (it is still guarded by the B12-B server-component test and is
 * reusable on a deeper page); it is simply no longer what the homepage leads with.
 *
 * ## Why numbered steps are justified here
 *
 * Numbering is decoration unless the order carries information. Here it does: this is
 * the actual sequence a lesson runs in, and step four is what makes it a loop rather
 * than a list — the review returns on a schedule. Every step names a mechanic that
 * ships today (`blocks/quiz`, `lib/srs.ts`, `config/capstones.ts`, `/review`), so the
 * claim is checkable against the repository.
 */

interface LoopStep {
  step: number
  verb: string
  title: string
  description: string
  icon: typeof BookOpen
}

const LOOP: LoopStep[] = [
  {
    step: 1,
    verb: 'Read',
    title: 'A concept, explained from first principles',
    description:
      'Each lesson opens with the question it exists to answer, then builds the mental model, the common mistakes, and a worked example.',
    icon: BookOpen,
  },
  {
    step: 2,
    verb: 'Recall',
    title: 'A quiz that tests judgment, not recognition',
    description:
      'Scenario questions with an explanation on every answer, so a wrong choice teaches you something rather than just costing a point.',
    icon: Layers,
  },
  {
    step: 3,
    verb: 'Apply',
    title: 'Capstone deliverables, not exercises',
    description:
      'Each module ends in real product work: an opportunity brief, a PRD, a metrics tree, written to a brief and kept in your portfolio.',
    icon: PenTool,
  },
  {
    step: 4,
    verb: 'Retain',
    title: 'Reviews that come back on schedule',
    description:
      'Concepts return as spaced-repetition cards timed to the point you are about to forget them. A few minutes keeps the whole model fresh.',
    icon: RotateCw,
  },
]

export function HowItWorksSection() {
  return (
    <section
      id="how-it-works"
      aria-labelledby="how-it-works-heading"
      className={`${SECTION_Y} bg-background border-t border-border/80 scroll-mt-24 lg:scroll-mt-28`}
    >
      <div className={CONTAINER}>
        <Reveal amount={0.25} className="max-w-[640px] mb-12">
          <div className={`${EYEBROW} mb-4`}>
            <span aria-hidden="true" className={EYEBROW_RULE} />
            THE LEARNING LOOP
          </div>
          <h2
            id="how-it-works-heading"
            className={`${SECTION_TITLE} mb-4`}
          >
            Read, recall, apply, retain.
          </h2>
          <p className={SECTION_LEAD}>
            Reading alone does not build product judgment. Every lesson runs the same four
            steps, and the fourth one brings you back.
          </p>
        </Reveal>

        <ol className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-px bg-border rounded-xl overflow-hidden border border-border">
          {LOOP.map((item, index) => {
            const Icon = item.icon
            return (
              // `Reveal` renders a div, so it sits *inside* the list item rather than
              // wrapping it: an <ol> may only contain <li>, and a div in between costs
              // the list its semantics for a screen reader.
              <li key={item.step} className="group h-full bg-surface transition-colors duration-300 hover:bg-background">
                <Reveal
                  amount={0.2}
                  delay={index * 70}
                  className="h-full p-6 lg:p-7 flex flex-col gap-4"
                >
                  <div className="flex items-center justify-between">
                    <span
                      className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-primary-soft text-primary ring-1 ring-primary/15 transition-transform duration-300 ease-spring-soft group-hover:-translate-y-0.5 group-hover:rotate-[-4deg] motion-reduce:transition-none motion-reduce:group-hover:translate-y-0 motion-reduce:group-hover:rotate-0"
                      aria-hidden="true"
                    >
                      <Icon size={17} />
                    </span>
                    <span
                      className="font-mono text-caption font-semibold text-border-strong transition-colors duration-300 group-hover:text-primary"
                      aria-hidden="true"
                    >
                      {String(item.step).padStart(2, '0')}
                    </span>
                  </div>

                  <div className="space-y-2">
                    <h3 className="font-display text-h4 font-semibold text-foreground leading-snug">
                      {item.verb}
                    </h3>
                    <p className="text-body-sm font-medium text-foreground/90 leading-snug">
                      {item.title}
                    </p>
                  </div>

                  <p className="text-body-sm text-ink-muted leading-relaxed mt-auto">
                    {item.description}
                  </p>
                </Reveal>
              </li>
            )
          })}
        </ol>

        {/* Supporting mechanics. A single quiet row rather than four more sections —
            these exist and help the story, but they are not the pitch. */}
        <Reveal amount={0.3} delay={120}>
          <p className="mt-8 text-body-sm text-ink-muted leading-relaxed max-w-[720px] text-pretty">
            Along the way: daily streaks with freezes for the days life gets in the way,
            badges for real milestones, a skill radar across seven product competencies,
            a searchable glossary, and an optional leaderboard if that is what keeps you
            going.
          </p>
        </Reveal>
      </div>
    </section>
  )
}
