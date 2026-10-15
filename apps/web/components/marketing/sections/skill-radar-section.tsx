/**
 * Skill Radar: seven product skills, scored from lessons finished and quizzes passed
 * (lib/skillRadar.ts). Capstones do not feed it, so the copy does not say they do.
 *
 * Layout (round 2): an editorial split. Heading, lead and the three points sit in the
 * left half; the radar sits in the right half inside a double-bezel card (SHELL +
 * SHELL_CORE) over a faint masked dot grid. No column is left empty at any width:
 * below `lg` the two halves stack, text first.
 *
 * Server component. The only interactive part is the Module 1 / Module 9 toggle,
 * which lives in the `SkillRadarToggle` client island and receives the demo values
 * as props so `config/content.ts` stays out of the client bundle.
 */

import {
  BAND_PLAIN,
  CONTAINER,
  DOT_GRID,
  SECTION_LEAD,
  SECTION_TITLE,
  SECTION_Y,
  SHELL,
  SHELL_CORE,
} from '@/components/marketing/styles'
import { SkillRadarToggle } from '@/components/marketing/sections/skill-radar-toggle'
import { SKILL_RADAR_DEMO } from '@/config/content'
import { ILLUSTRATION_CAPTION, SAMPLE_LEARNER_NAME } from '@/config/marketing'

const POINTS: readonly string[] = [
  'Updates as you learn.',
  'Shows what to work on next.',
  'Appears on your portfolio.',
]

/**
 * Recentred mask for the dot grid around the radar card. The shared DOT_GRID mask is
 * anchored at 50% 30%, which left one bright row of dots above the card. Centring it
 * turns the dots into an even halo that fades out on every side.
 */
const DOT_HALO =
  '[&::before]:[mask-image:radial-gradient(ellipse_at_50%_50%,black_45%,transparent_80%)] [&::before]:[-webkit-mask-image:radial-gradient(ellipse_at_50%_50%,black_45%,transparent_80%)]'

export function SkillRadarSection() {
  return (
    <section
      id="skill-radar"
      aria-labelledby="skill-radar-heading"
      data-home-section="skill-radar"
      className={`${BAND_PLAIN} ${SECTION_Y} overflow-x-clip`}
    >
      <div className={CONTAINER}>
        <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-12 lg:gap-14">
          <div className="min-w-0 lg:col-span-6">
            <h2 id="skill-radar-heading" className={`${SECTION_TITLE} mb-5`}>
              See where you are strong.
            </h2>
            <p className={SECTION_LEAD}>
              Seven product skills, scored from the lessons you finish and the quizzes you pass.
            </p>

            <ol className="mt-10 flex max-w-[30rem] flex-col divide-y divide-border border-y border-border">
              {POINTS.map((text, index) => (
                <li key={text} className="flex items-baseline gap-5 py-4">
                  <span
                    aria-hidden="true"
                    className="w-6 shrink-0 text-body-sm font-semibold tabular-nums text-primary"
                  >
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <span className="text-body-lg font-medium text-foreground">{text}</span>
                </li>
              ))}
            </ol>
          </div>

          {/* The dot grid bleeds past the card on large screens only (never widens the
              page on phones), with a centred mask so it reads as an even halo. The horizontal
              bleed matches CONTAINER's lg:px-8 so it never passes the viewport edge, and
              the section clips x-overflow as a backstop. */}
          <div className={`${DOT_GRID} ${DOT_HALO} min-w-0 lg:col-span-6 lg:-mx-8 lg:-my-10 lg:px-8 lg:py-10`}>
            <div className={SHELL}>
              <div className={`${SHELL_CORE} @container`}>
                <SkillRadarToggle
                  before={SKILL_RADAR_DEMO.before}
                  after={SKILL_RADAR_DEMO.after}
                  caption={ILLUSTRATION_CAPTION}
                  learnerName={SAMPLE_LEARNER_NAME}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
