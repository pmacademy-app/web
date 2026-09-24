import { BookOpen, Layers, PenTool, RotateCw } from 'lucide-react'

import { Reveal } from '@/components/marketing/motion/reveal'

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
      'Each module ends in real product work — an opportunity brief, a PRD, a metrics tree — written to a brief and kept in your portfolio.',
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
      className="py-20 lg:py-28 bg-background border-t border-border/80 scroll-mt-24 lg:scroll-mt-28"
    >
      <div className="max-w-[1120px] mx-auto px-5 lg:px-8">
        <Reveal amount={0.25} className="max-w-[640px] mb-12">
          <div className="text-xs font-mono font-semibold uppercase tracking-wider text-primary mb-3">
            THE LEARNING LOOP
          </div>
          <h2
            id="how-it-works-heading"
            className="font-display text-h1 lg:text-display-lg font-semibold text-foreground mb-4 tracking-[-0.02em]"
          >
            Read, recall, apply, retain.
          </h2>
          <p className="text-body-lg text-locked leading-relaxed">
            Reading alone does not build product judgment. Every lesson runs the same four
            steps, and the fourth one brings you back.
          </p>
        </Reveal>

        <ol className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-px bg-border rounded-sm overflow-hidden border border-border">
          {LOOP.map((item, index) => {
            const Icon = item.icon
            return (
              <Reveal
                key={item.step}
                amount={0.2}
                delay={index * 70}
                className="h-full bg-surface"
              >
                <li className="h-full p-6 lg:p-7 flex flex-col gap-4">
                  <div className="flex items-center justify-between">
                    <span
                      className="inline-flex h-9 w-9 items-center justify-center rounded-sm bg-primary/8 text-primary"
                      aria-hidden="true"
                    >
                      <Icon size={17} />
                    </span>
                    <span
                      className="font-mono text-caption font-semibold text-locked/70"
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

                  <p className="text-body-sm text-locked leading-relaxed mt-auto">
                    {item.description}
                  </p>
                </li>
              </Reveal>
            )
          })}
        </ol>

        {/* Supporting mechanics. A single quiet row rather than four more sections —
            these exist and help the story, but they are not the pitch. */}
        <Reveal amount={0.3} delay={120}>
          <p className="mt-8 text-body-sm text-locked leading-relaxed max-w-[720px]">
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
