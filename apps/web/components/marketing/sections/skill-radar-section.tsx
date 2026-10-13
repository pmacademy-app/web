/**
 * Skill Radar: seven product skills, scored from lessons finished and quizzes passed
 * (lib/skillRadar.ts). Capstones do not feed it, so the copy does not say they do.
 *
 * Server component. The only interactive part is the Module 1 / Module 9 toggle,
 * which lives in the `SkillRadarToggle` client island and receives the demo values
 * as props so `config/content.ts` stays out of the client bundle.
 */

import {
  BAND_PLAIN,
  CARD,
  CONTAINER,
  SECTION_LEAD,
  SECTION_TITLE,
  SECTION_Y,
} from '@/components/marketing/styles'
import { SkillRadarToggle } from '@/components/marketing/sections/skill-radar-toggle'
import { SKILL_RADAR_DEMO } from '@/config/content'
import { ILLUSTRATION_CAPTION } from '@/config/marketing'

const POINTS = [
  'Updates as you learn.',
  'Shows what to work on next.',
  'Appears on your portfolio.',
] as const

export function SkillRadarSection() {
  return (
    <section
      id="skill-radar"
      aria-labelledby="skill-radar-heading"
      data-home-section="skill-radar"
      className={`${BAND_PLAIN} ${SECTION_Y}`}
    >
      <div className={CONTAINER}>
        <div className="flex flex-col gap-6">
          <h2 id="skill-radar-heading" className={SECTION_TITLE}>
            See where you are strong.
          </h2>
          <p className={SECTION_LEAD}>
            Seven product skills, scored from the lessons you finish and the quizzes you pass.
          </p>
        </div>

        <div className="mt-12 grid gap-10 lg:mt-16 lg:grid-cols-12 lg:gap-12">
          <ul className="flex flex-col self-center border-t border-border lg:col-span-4">
            {POINTS.map((point) => (
              <li
                key={point}
                className="border-b border-border py-5 text-body-lg font-medium text-foreground"
              >
                {point}
              </li>
            ))}
          </ul>

          <div className={`${CARD} p-6 sm:p-8 lg:col-span-8`}>
            <SkillRadarToggle
              before={SKILL_RADAR_DEMO.before}
              after={SKILL_RADAR_DEMO.after}
              caption={ILLUSTRATION_CAPTION}
            />
          </div>
        </div>
      </div>
    </section>
  )
}
