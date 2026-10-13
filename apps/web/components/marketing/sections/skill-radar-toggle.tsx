'use client'

/**
 * Module 1 / Module 9 toggle for the homepage Skill Radar section.
 *
 * Client island: the only state is which demo snapshot is showing. The radar itself
 * (`product-mockup/skill-radar.tsx`) is a hook-free component; it is keyed on the
 * selected state so its CSS `animate-in` entry replays on each switch. That gives a
 * redraw transition with no animation library, and `motion-reduce:animate-none`
 * inside the radar turns it into an instant swap.
 *
 * The values are SKILL_RADAR_DEMO, written for demonstration, and the figure says so.
 * They only shape the drawing: no numeric score is printed anywhere (owner rule, no
 * invented scores next to the Sample Learner persona). The radar's own text summary is
 * hidden, the legend below names the skills, and the live region states the module.
 */

import { useState } from 'react'

import { SkillRadar } from '@/components/marketing/product-mockup/skill-radar'
import { Button } from '@/components/ui/button'
import { SEGMENT_GROUP, SEGMENT_OPTION } from '@/components/marketing/styles'
import { trackRadarPreviewToggle, type RadarPreviewState } from '@/lib/analytics'
import { SKILL_COLORS, SKILL_LABELS } from '@/lib/design/tokens'
import { SKILL_CLUSTER_IDS } from '@/lib/skillRadar'
import type { SkillValues } from '@/types'

const OPTIONS: { state: RadarPreviewState; label: string }[] = [
  { state: 'module_1', label: 'Module 1' },
  { state: 'module_9', label: 'Module 9' },
]

interface SkillRadarToggleProps {
  /** Demo values shown for "Module 1" (SKILL_RADAR_DEMO.before). */
  before: SkillValues
  /** Demo values shown for "Module 9" (SKILL_RADAR_DEMO.after). */
  after: SkillValues
  /** Caption line under the figure. Passed from the server section. */
  caption: string
}

export function SkillRadarToggle({ before, after, caption }: SkillRadarToggleProps) {
  const [state, setState] = useState<RadarPreviewState>('module_1')
  const isAfter = state === 'module_9'
  const values = isAfter ? after : before
  const label = isAfter ? 'Module 9' : 'Module 1'

  function select(next: RadarPreviewState) {
    if (next === state) return
    setState(next)
    trackRadarPreviewToggle(next)
  }

  return (
    <figure className="flex flex-col gap-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <span className="text-body-sm font-semibold text-ink-muted">Concept preview</span>
        <div role="group" aria-label="Show sample radar after" className={SEGMENT_GROUP}>
          {OPTIONS.map((option) => (
            <Button
              key={option.state}
              type="button"
              variant="ghost"
              size="lg"
              aria-pressed={state === option.state}
              onClick={() => select(option.state)}
              className={SEGMENT_OPTION}
            >
              {option.label}
            </Button>
          ))}
        </div>
      </div>

      <p className="sr-only" aria-live="polite">
        Showing the sample radar after {label}.
      </p>

      <div className="grid items-center gap-8 sm:grid-cols-[minmax(0,320px)_minmax(0,1fr)] sm:gap-10">
        <div aria-hidden="true" className="mx-auto w-full max-w-[320px] [&_svg]:h-auto [&_svg]:max-w-full">
          <SkillRadar
            key={state}
            values={values}
            previousValues={isAfter ? before : undefined}
            size={320}
            showLegend={false}
          />
        </div>

        <ul aria-label="Skills on the radar" className="flex flex-col gap-3">
          {SKILL_CLUSTER_IDS.map((cluster) => (
            <li key={cluster} className="flex items-center gap-3 text-body-sm">
              <span
                aria-hidden="true"
                className="size-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: SKILL_COLORS[cluster] }}
              />
              <span className="text-ink-muted">{SKILL_LABELS[cluster]}</span>
            </li>
          ))}
        </ul>
      </div>

      <figcaption className="text-caption leading-snug text-ink-muted">
        {isAfter ? 'Dashed outline shows Module 1. ' : null}
        {caption}
      </figcaption>
    </figure>
  )
}
