'use client'

/**
 * A lesson diagram drawn natively from its compiled plan (see lib/diagrams/plan.ts).
 *
 * - Animates in the first time it scrolls into view (CSS only, off under reduced motion).
 * - "Walk through" steps through the boxes one at a time: done boxes fill, the current one
 *   is ringed, later ones fade. Arrow keys work while the figure has focus.
 * - "Focus view" opens the same diagram full screen on phones and in a large dialog on desktop.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Maximize2, Play, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { walkOrder, type DiagramPlan } from '@/lib/diagrams/plan'
import { DiagramBody, LoopMarkers, type NodeState } from './DiagramLayouts'

interface DiagramFigureProps {
  plan: DiagramPlan
  title?: string
  /** Text alternative for screen readers, built from the plan when absent. */
  label?: string
}

function useInView<T extends Element>() {
  const ref = useRef<T>(null)
  const [seen, setSeen] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el || seen) return
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setSeen(true)
          io.disconnect()
        }
      },
      { rootMargin: '0px 0px -12% 0px' }
    )
    io.observe(el)
    return () => io.disconnect()
  }, [seen])
  return { ref, seen }
}

function describe(plan: DiagramPlan): string {
  const steps = walkOrder(plan).map((id) => plan.nodes[id]?.title).filter(Boolean)
  return `Diagram: ${steps.join(', then ')}.`
}

function Walker({ plan, step, setStep, order }: { plan: DiagramPlan; step: number; setStep: (n: number) => void; order: string[] }) {
  const total = order.length
  if (step < 0) {
    return (
      <Button type="button" variant="secondary" size="sm" onClick={() => setStep(0)} className="bg-primary-soft text-primary hover:bg-primary-soft/80">
        <Play className="size-3.5 fill-current" />
        Walk through {total} steps
      </Button>
    )
  }
  const node = plan.nodes[order[step]]
  return (
    <div className="flex w-full items-center gap-2">
      <Button type="button" variant="outline" size="icon-sm" aria-label="Previous step" disabled={step === 0} onClick={() => setStep(step - 1)}>
        <ChevronLeft />
      </Button>
      <div className="min-w-0 flex-1 text-center" aria-live="polite">
        <p className="text-[11px] font-bold uppercase tracking-wider text-primary">Step {step + 1} of {total}</p>
        <p className="truncate text-[13px] font-semibold">{node?.title}</p>
      </div>
      {step < total - 1 ? (
        <Button type="button" size="icon-sm" aria-label="Next step" onClick={() => setStep(step + 1)}>
          <ChevronRight />
        </Button>
      ) : (
        <Button type="button" size="sm" onClick={() => setStep(-1)}>
          Done
        </Button>
      )}
      <Button type="button" variant="ghost" size="icon-sm" aria-label="Stop walk-through" onClick={() => setStep(-1)}>
        <X />
      </Button>
    </div>
  )
}

export default function DiagramFigure({ plan, title, label }: DiagramFigureProps) {
  const order = useMemo(() => walkOrder(plan), [plan])
  const index = useMemo(() => Object.fromEntries(order.map((id, k) => [id, k])), [order])
  const [step, setStep] = useState(-1)
  const [focus, setFocus] = useState(false)
  const { ref, seen } = useInView<HTMLElement>()

  const states = useMemo(() => {
    if (step < 0) return {} as Record<string, NodeState>
    return Object.fromEntries(order.map((id, k) => [id, k < step ? 'done' : k === step ? 'now' : 'todo'])) as Record<string, NodeState>
  }, [order, step])

  const onKey = (e: React.KeyboardEvent) => {
    if (step < 0) return
    if (e.key === 'ArrowRight') setStep(Math.min(order.length - 1, step + 1))
    if (e.key === 'ArrowLeft') setStep(Math.max(0, step - 1))
    if (e.key === 'Escape') setStep(-1)
  }

  const a11y = label || describe(plan)
  const body = (
    <>
      <DiagramBody plan={plan} states={states} order={index} />
      <LoopMarkers plan={plan} />
    </>
  )

  return (
    <figure
      ref={ref}
      data-inview={seen}
      data-walking={step >= 0}
      onKeyDown={onKey}
      className="dg my-6 overflow-hidden rounded-2xl border border-border bg-surface"
    >
      <div className="flex items-center gap-3 px-4 pt-3.5">
        <div className="min-w-0 flex-1">
          <p className="text-[10.5px] font-bold uppercase tracking-[0.08em] text-ink-muted">Diagram</p>
          {title && <p className="text-[15px] font-semibold leading-snug">{title}</p>}
        </div>
        <Button type="button" variant="outline" size="icon-sm" aria-label="Open in focus view" onClick={() => setFocus(true)}>
          <Maximize2 />
        </Button>
      </div>
      <div role="img" aria-label={a11y} className="sr-only" />
      <div aria-hidden className="px-4 pb-4 pt-3">{body}</div>
      <figcaption className={cn('flex items-center gap-2 border-t border-border/70 bg-background/70 px-3 py-2.5')}>
        <Walker plan={plan} step={step} setStep={setStep} order={order} />
      </figcaption>

      <Dialog open={focus} onOpenChange={setFocus}>
        <DialogContent className="dg flex h-dvh max-h-dvh w-screen max-w-none flex-col gap-0 rounded-none p-0 sm:h-[min(92dvh,900px)] sm:w-[min(94vw,1200px)] sm:max-w-none sm:rounded-2xl" data-inview>
          <div className="flex items-center gap-3 border-b border-border px-4 py-3 pr-14">
            <div className="min-w-0">
              <DialogTitle className="text-base font-semibold">{title || 'Diagram'}</DialogTitle>
              <DialogDescription className="sr-only">{a11y}</DialogDescription>
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto bg-background px-4 py-5 sm:px-8">
            <div className="mx-auto max-w-5xl" aria-hidden>{body}</div>
          </div>
          <div className="flex items-center gap-2 border-t border-border px-3 py-2.5">
            <Walker plan={plan} step={step} setStep={setStep} order={order} />
          </div>
        </DialogContent>
      </Dialog>
    </figure>
  )
}
