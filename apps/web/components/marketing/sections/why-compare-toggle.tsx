'use client'

/**
 * Before/after comparison for the Why section: the same Sample Learner shown as a
 * course certificate, then as a public portfolio with artefacts.
 *
 * Client island for one reason: the pressed state. Everything it displays arrives as
 * props from the server parent (`config/marketing.ts` imports the capstone templates,
 * so it must not be imported here), including the caption node.
 *
 * Both panels are always rendered into the same grid cell, so the figure is as tall
 * as the taller panel in either state and switching never shifts the page. The
 * hidden panel is `inert` and `aria-hidden`. The crossfade is CSS opacity only and is
 * removed under `prefers-reduced-motion`.
 */

import Image from 'next/image'
import { useId, useState, type ReactNode } from 'react'

import { Button } from '@/components/ui/button'
import { SEGMENT_GROUP, SEGMENT_OPTION } from '@/components/marketing/styles'
import { trackWhyCompareToggle, type WhyCompareState } from '@/lib/analytics'
import { cn } from '@/lib/utils'

export interface WhyCompareCapstone {
  number: number
  /** Zero-padded label ("01"). */
  index: string
  title: string
  /** Competency cluster id; resolves to `var(--color-skill-<skill>)`. */
  skill: string
}

export interface WhyCompareToggleProps {
  learnerName: string
  capstones: readonly WhyCompareCapstone[]
  certificateSrc: string
  certificateLabel: string
  /** Rendered as the figure caption; pass `<IllustrationCaption as="figcaption" />`. */
  caption: ReactNode
}

const OPTIONS: ReadonlyArray<{ value: WhyCompareState; label: string }> = [
  { value: 'certificate', label: 'Course certificate' },
  { value: 'portfolio', label: 'Portfolio with artefacts' },
]

/** Capstone rows shown in the portfolio panel; the rest collapse into one muted line. */
const VISIBLE_CAPSTONES = 4

const PANEL =
  'col-start-1 row-start-1 transition-opacity duration-200 ease-out-quint motion-reduce:transition-none'

export function WhyCompareToggle({
  learnerName,
  capstones,
  certificateSrc,
  certificateLabel,
  caption,
}: WhyCompareToggleProps) {
  const [state, setState] = useState<WhyCompareState>('certificate')
  const panelId = useId()

  function select(next: WhyCompareState) {
    if (next === state) return
    setState(next)
    trackWhyCompareToggle(next)
  }

  const initials = learnerName
    .split(/\s+/)
    .map((part) => part.charAt(0))
    .join('')
    .slice(0, 2)
    .toUpperCase()

  const visibleCapstones = capstones.slice(0, VISIBLE_CAPSTONES)
  const hiddenCount = capstones.length - visibleCapstones.length
  const currentLabel = OPTIONS.find((option) => option.value === state)?.label ?? ''

  return (
    <div className="flex flex-col gap-5">
      <div
        role="group"
        aria-label="Show the same learner as"
        className={cn(SEGMENT_GROUP, 'flex w-full sm:inline-flex sm:w-auto sm:self-start')}
      >
        {OPTIONS.map((option) => (
          <Button
            key={option.value}
            type="button"
            variant="ghost"
            aria-pressed={state === option.value}
            aria-controls={panelId}
            onClick={() => select(option.value)}
            className={cn(
              SEGMENT_OPTION,
              'h-auto flex-1 whitespace-normal px-3 py-2 text-center leading-tight sm:flex-none sm:whitespace-nowrap sm:px-4',
            )}
          >
            {option.label}
          </Button>
        ))}
      </div>

      <p className="sr-only" aria-live="polite">
        Showing the sample learner as a {currentLabel.toLowerCase()}.
      </p>

      <figure id={panelId} className="m-0">
        <div className="grid">
          {/* (a) A plain course-completion certificate. Generic on purpose. */}
          <div
            aria-hidden={state !== 'certificate'}
            inert={state !== 'certificate'}
            className={cn(
              PANEL,
              'flex items-center',
              state === 'certificate' ? 'opacity-100' : 'opacity-0',
            )}
          >
            <div className="w-full rounded-lg border border-border bg-surface px-6 py-12 text-center sm:px-10 sm:py-16">
              <p className="text-caption font-medium uppercase tracking-[0.14em] text-ink-muted">
                Certificate of completion
              </p>
              <p className="mt-5 font-sans text-[clamp(1.5rem,2.8vw,2rem)] font-semibold leading-tight tracking-[-0.015em] text-foreground">
                {learnerName}
              </p>
              <div aria-hidden="true" className="mx-auto mt-5 h-px w-16 bg-border" />
              <p className="mt-5 text-body text-ink-muted">Online PM course.</p>
            </div>
          </div>

          {/* (b) A public portfolio page with the real capstone titles. */}
          <div
            aria-hidden={state !== 'portfolio'}
            inert={state !== 'portfolio'}
            className={cn(PANEL, state === 'portfolio' ? 'opacity-100' : 'opacity-0')}
          >
            <div className="rounded-lg border border-border bg-surface">
              <div className="flex items-center gap-3 border-b border-border px-5 py-4 sm:px-6">
                <span
                  aria-hidden="true"
                  className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary-soft text-sm font-semibold text-primary"
                >
                  {initials}
                </span>
                <div className="min-w-0">
                  <p className="text-body font-semibold leading-tight text-foreground">{learnerName}</p>
                  <p className="text-caption text-ink-muted">Public portfolio</p>
                </div>
              </div>

              <ol className="divide-y divide-border px-5 sm:px-6">
                {visibleCapstones.map((capstone) => (
                  <li key={capstone.number} className="flex items-baseline gap-3 py-2.5">
                    <span aria-hidden="true" className="w-6 shrink-0 font-mono text-caption tabular-nums text-ink-muted">
                      {capstone.index}
                    </span>
                    <span
                      aria-hidden="true"
                      className="relative top-[-0.1em] size-1.5 shrink-0 rounded-full"
                      style={{ backgroundColor: `var(--color-skill-${capstone.skill})` }}
                    />
                    <span className="min-w-0 text-body-sm text-foreground">{capstone.title}</span>
                  </li>
                ))}
                {hiddenCount > 0 ? (
                  <li className="py-2.5 pl-9 text-body-sm text-ink-muted">
                    + {hiddenCount} more capstones
                  </li>
                ) : null}
              </ol>

              <div className="flex items-center gap-4 border-t border-border px-5 py-4 sm:px-6">
                <Image
                  src={certificateSrc}
                  alt={`${certificateLabel} for ${learnerName}`}
                  width={88}
                  height={56}
                  sizes="88px"
                  className="h-14 w-[88px] shrink-0 rounded-sm border border-border object-cover"
                />
                <p className="text-body-sm text-ink-muted">
                  <span className="font-semibold text-foreground">{certificateLabel}</span>
                  {' '}attached to the same page.
                </p>
              </div>
            </div>
          </div>
        </div>

        {caption}
      </figure>
    </div>
  )
}
