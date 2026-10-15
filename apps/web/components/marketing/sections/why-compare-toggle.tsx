'use client'

/**
 * Before/after comparison for the Why section: the same Sample Learner shown as a
 * course certificate, then as a public portfolio with artefacts.
 *
 * Client island for one reason: the pressed state. Everything it displays arrives as
 * props from the server parent (`config/marketing.ts` imports the capstone templates,
 * so it must not be imported here), including the caption node.
 *
 * Both panels are always rendered into the same grid cell inside one double-bezel
 * frame (SHELL / SHELL_CORE), so the figure is as tall as the taller panel in either
 * state and switching never shifts the page. The drawn, generic certificate stretches
 * to that height inside a thin mat (wording centred, date and signature line pinned to
 * the bottom), so the shell hugs the drawing instead of framing empty space. The
 * hidden panel is `inert` and `aria-hidden`. The crossfade is CSS opacity only and is
 * removed under `prefers-reduced-motion`.
 */

import { Award } from 'lucide-react'
import { useId, useState, type ReactNode } from 'react'

import { Button } from '@/components/ui/button'
import { SEGMENT_GROUP, SEGMENT_OPTION, SHELL, SHELL_CORE } from '@/components/marketing/styles'
import { trackWhyCompareToggle, type WhyCompareState } from '@/lib/analytics'
import { cn } from '@/lib/utils'

export interface WhyCompareCapstone {
  number: number
  /** Zero-padded label ("01"). */
  index: string
  title: string
  /** Competency cluster id; resolves to `var(--color-skill-<skill>)`. */
  skill: string
  /** Deliverable type from the capstone definition ("Full PRD"). */
  deliverableType: string
}

export interface WhyCompareToggleProps {
  learnerName: string
  capstones: readonly WhyCompareCapstone[]
  /** Still accepted from the server parent; no longer drawn (the portfolio page shows no certificate). */
  certificateSrc?: string
  certificateLabel?: string
  /** Rendered as the figure caption; pass `<IllustrationCaption as="figcaption" />`. */
  caption: ReactNode
}

const OPTIONS: ReadonlyArray<{ value: WhyCompareState; label: string }> = [
  { value: 'certificate', label: 'Course certificate' },
  { value: 'portfolio', label: 'Portfolio with artefacts' },
]

const PANEL =
  'col-start-1 row-start-1 transition-opacity duration-200 ease-out-quint motion-reduce:transition-none'

export function WhyCompareToggle({
  learnerName,
  capstones,
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

  // One chip per deliverable type (first capstone's skill colour wins); no titles here.
  const artefacts = capstones.filter(
    (capstone, i) => capstones.findIndex((c) => c.deliverableType === capstone.deliverableType) === i,
  )
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
        <div className={SHELL}>
          <div className={cn(SHELL_CORE, 'grid')}>
            {/* (a) A plain course-completion certificate. Generic on purpose: a name on paper. */}
            <div
              aria-hidden={state !== 'certificate'}
              inert={state !== 'certificate'}
              className={cn(
                PANEL,
                'flex bg-surface-muted/60 p-2.5 sm:p-3',
                state === 'certificate' ? 'opacity-100' : 'opacity-0',
              )}
            >
              <div className="flex w-full flex-col rounded-md border border-border bg-surface p-1.5 shadow-tinted">
                <div className="flex flex-1 flex-col rounded-[0.25rem] border border-border px-5 pb-5 pt-7 text-center sm:px-10 sm:pb-6 sm:pt-9">
                  <div className="my-auto">
                    <p className="text-caption font-medium uppercase tracking-[0.14em] text-ink-muted">
                      Certificate of completion
                    </p>
                    <p className="mt-5 text-body-sm italic text-ink-muted">This certifies that</p>
                    <p className="mt-2 font-sans text-[clamp(1.5rem,2.8vw,2rem)] font-semibold leading-tight tracking-[-0.015em] text-foreground">
                      {learnerName}
                    </p>
                    <div aria-hidden="true" className="mx-auto mt-4 h-px w-16 bg-border" />
                    <p className="mt-4 text-body text-ink-muted">Online PM course.</p>
                  </div>

                  <div
                    aria-hidden="true"
                    className="mx-auto mt-8 grid w-full max-w-sm grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-end gap-4"
                  >
                    <div className="border-t border-border pt-1.5 text-caption text-ink-muted">Date</div>
                    <span className="flex size-11 items-center justify-center rounded-full border border-dashed border-border-strong text-ink-muted">
                      <Award size={18} strokeWidth={1.5} />
                    </span>
                    <div className="border-t border-border pt-1.5 text-caption text-ink-muted">Signature</div>
                  </div>
                </div>
              </div>
            </div>

            {/* (b) A public portfolio page: the same learner, the deliverable types and skill colours. */}
            <div
              aria-hidden={state !== 'portfolio'}
              inert={state !== 'portfolio'}
              className={cn(PANEL, 'flex flex-col', state === 'portfolio' ? 'opacity-100' : 'opacity-0')}
            >
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

              <div className="flex flex-1 flex-col px-5 py-5 sm:px-6">
                <p className="text-caption text-ink-muted">Artefacts on the page</p>
                <ul className="mt-3 flex flex-wrap gap-2">
                  {artefacts.map((artefact) => (
                    <li
                      key={artefact.deliverableType}
                      className="inline-flex items-center gap-2 rounded-full border border-border bg-surface-muted/60 px-3 py-1.5 text-body-sm text-foreground"
                    >
                      <span
                        aria-hidden="true"
                        className="size-1.5 shrink-0 rounded-full"
                        style={{ backgroundColor: `var(--color-skill-${artefact.skill})` }}
                      />
                      {artefact.deliverableType}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>

        {caption}
      </figure>
    </div>
  )
}
