/**
 * Presentational layouts for native lesson diagrams, one per shape in `lib/diagrams/plan.ts`.
 * No state here: `DiagramFigure` owns the walk-through and passes each node's state down.
 *
 * Animation hooks (styles in app/globals.css, "Lesson diagrams"):
 *   .dg-item  rises in on first view, staggered by --i
 *   .dg-line  connector that grows in after the node above it
 *   .dg-node  transitions between walk-through states (data-state)
 */
import type { CSSProperties, ReactNode } from 'react'
import { ArrowDown, ArrowRight, Check, Link2, RotateCcw, Target } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { DiagramNode, DiagramPlan, DiagramTreeNode } from '@/lib/diagrams/plan'

export type NodeState = 'done' | 'now' | 'todo' | undefined

export interface LayoutProps {
  plan: DiagramPlan
  /** Walk-through state per node id; empty when not walking. */
  states: Record<string, NodeState>
  /** Stagger index per node id, used for the entrance animation. */
  order: Record<string, number>
}

const ROLE_CLASS: Record<DiagramNode['role'], string> = {
  start: 'bg-primary-hover border-primary-hover text-primary-foreground',
  step: 'bg-surface border-border text-foreground',
  decision: 'bg-warning-bg border-accent/50 text-foreground',
  goal: 'bg-primary-soft border-primary/30 text-foreground',
}

function stagger(i: number | undefined): CSSProperties {
  return { '--i': i ?? 0 } as CSSProperties
}

export function NodeCard({ node, state, i, compact = false, className }: { node: DiagramNode; state?: NodeState; i?: number; compact?: boolean; className?: string }) {
  const onDark = node.role === 'start'
  return (
    <div
      data-state={state}
      style={stagger(i)}
      className={cn(
        'dg-item dg-node relative rounded-2xl border-[1.5px]',
        compact ? 'px-3 py-2' : 'px-3.5 py-2.5',
        ROLE_CLASS[node.role],
        state === 'now' && 'border-primary ring-4 ring-primary-soft',
        state === 'todo' && 'opacity-45',
        className
      )}
    >
      <div className="flex items-start gap-2.5">
        {node.role === 'decision' && (
          <span aria-hidden className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-md bg-accent text-xs font-extrabold text-accent-foreground">?</span>
        )}
        <div className="min-w-0">
          <p className={cn('font-semibold leading-snug', compact ? 'text-[13px]' : 'text-sm')}>{node.title}</p>
          {node.subtitle && (
            <p className={cn('mt-0.5 leading-snug', compact ? 'text-xs' : 'text-[13px]', onDark ? 'text-primary-foreground/75' : 'text-ink-muted')}>{node.subtitle}</p>
          )}
        </div>
      </div>
    </div>
  )
}

export function EdgeChip({ label, i }: { label: string; i?: number }) {
  const tone = /^\s*(yes|true)\b/i.test(label) ? 'yes' : /^\s*(no|false|not)\b/i.test(label) ? 'no' : 'neutral'
  return (
    <span
      style={stagger(i)}
      className={cn(
        'dg-item inline-flex min-h-6 items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold leading-tight',
        tone === 'yes' && 'border-primary/30 bg-primary-soft text-primary',
        tone === 'no' && 'border-danger/25 bg-danger-bg text-danger',
        tone === 'neutral' && 'border-border bg-surface-muted text-ink-muted'
      )}
    >
      {label}
    </span>
  )
}

function Connector({ i, arrow = true, tall = false }: { i?: number; arrow?: boolean; tall?: boolean }) {
  return (
    <div aria-hidden className="flex flex-col items-center">
      <span style={stagger(i)} className={cn('dg-line block w-0.5 rounded-full bg-border-strong', tall ? 'h-6' : 'h-4')} />
      {arrow && <ArrowDown style={stagger(i)} className="dg-item -mt-1 size-3.5 text-border-strong" strokeWidth={2.5} />}
    </div>
  )
}

function Group({ label, children, i }: { label?: string; children: ReactNode; i?: number }) {
  return (
    <div style={stagger(i)} className="dg-item relative rounded-2xl border-[1.5px] border-dashed border-border-strong/70 bg-background/60 px-2.5 pb-2.5 pt-5">
      {label && (
        <span className="absolute -top-3 left-1/2 max-w-[90%] -translate-x-1/2 truncate rounded-full border border-border bg-surface px-2.5 py-0.5 text-xs font-semibold text-ink-muted">
          {label}
        </span>
      )}
      {children}
    </div>
  )
}

/* ─── Chain ─────────────────────────────────────────────────────────────────── */

export function ChainLayout({ plan, states, order, steps }: LayoutProps & { steps: string[] }) {
  return (
    <div className="@container">
      <ol className="flex flex-col gap-2.5 @3xl:hidden">
        {steps.map((id, k) => {
          const st = states[id]
          return (
            <li key={id} className="relative flex items-stretch gap-3">
              {k < steps.length - 1 && (
                <span
                  aria-hidden
                  style={stagger(order[id])}
                  className={cn('dg-line absolute left-[15px] top-9 -bottom-3 w-0.5 rounded-full', st === 'done' ? 'bg-primary' : 'bg-border')}
                />
              )}
              <span
                aria-hidden
                style={stagger(order[id])}
                className={cn(
                  'dg-item dg-node relative z-10 mt-1.5 grid size-8 shrink-0 place-items-center rounded-full border-2 bg-surface text-xs font-bold tabular-nums',
                  st === 'done' ? 'border-primary bg-primary text-primary-foreground' : st === 'now' ? 'border-primary text-primary ring-4 ring-primary-soft' : 'border-border text-ink-muted'
                )}
              >
                {st === 'done' ? <Check className="size-3.5" strokeWidth={3} /> : k + 1}
              </span>
              <NodeCard node={plan.nodes[id]} state={st} i={order[id]} className="flex-1" />
            </li>
          )
        })}
      </ol>
      <ol className="hidden items-stretch gap-1.5 @3xl:flex">
        {steps.map((id, k) => (
          <li key={id} className="flex flex-1 items-stretch gap-1.5">
            <NodeCard node={plan.nodes[id]} state={states[id]} i={order[id]} compact className="flex-1" />
            {k < steps.length - 1 && <ArrowRight aria-hidden style={stagger(order[id])} className="dg-item size-4 shrink-0 self-center text-border-strong" strokeWidth={2.5} />}
          </li>
        ))}
      </ol>
    </div>
  )
}

/* ─── Ring ──────────────────────────────────────────────────────────────────── */

export function RingLayout({ plan, states, order, steps, loopLabel }: LayoutProps & { steps: string[]; loopLabel?: string }) {
  const n = steps.length
  // Positions are in percent of a square box so the ring scales with the screen.
  const R = { x: 30, y: 36 }
  const at = (k: number) => {
    const a = ((-90 + (360 / n) * k) * Math.PI) / 180
    return { x: 50 + R.x * Math.cos(a), y: 50 + R.y * Math.sin(a), a }
  }
  const arc = (k: number) => {
    const gap = 20
    const a1 = ((-90 + (360 / n) * k + gap) * Math.PI) / 180
    const a2 = ((-90 + (360 / n) * (k + 1) - gap) * Math.PI) / 180
    const p = (a: number) => `${(50 + R.x * Math.cos(a)).toFixed(2)} ${(50 + R.y * Math.sin(a)).toFixed(2)}`
    return `M${p(a1)} A${R.x} ${R.y} 0 0 1 ${p(a2)}`
  }
  return (
    <div className="relative mx-auto aspect-square w-full max-w-[360px]">
      <svg aria-hidden viewBox="0 0 100 100" className="absolute inset-0 size-full overflow-visible">
        <defs>
          <marker id="dg-ring-head" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
            <path d="M0 0 10 5 0 10z" className="fill-primary/40" />
          </marker>
          <marker id="dg-ring-loop" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
            <path d="M0 0 10 5 0 10z" className="fill-accent" />
          </marker>
        </defs>
        {steps.map((id, k) => {
          const loop = k === n - 1
          return (
            <path
              key={id}
              d={arc(k)}
              pathLength={1}
              fill="none"
              strokeWidth={0.8}
              strokeLinecap="round"
              markerEnd={`url(#${loop ? 'dg-ring-loop' : 'dg-ring-head'})`}
              style={stagger(order[id])}
              className={cn('dg-arc', loop ? 'dg-arc-loop stroke-accent' : 'stroke-primary/40')}
            />
          )
        })}
      </svg>
      <div className="absolute left-1/2 top-1/2 flex w-[42%] -translate-x-1/2 -translate-y-1/2 flex-col items-center text-center">
        <span style={stagger(n)} className="dg-item dg-spin grid size-10 place-items-center rounded-xl bg-warning-bg text-warning">
          <RotateCcw className="size-5" />
        </span>
        <span style={stagger(n)} className="dg-item mt-1.5 text-xs font-bold text-warning">{loopLabel || 'Repeats'}</span>
      </div>
      {steps.map((id, k) => {
        const p = at(k)
        const node = plan.nodes[id]
        const st = states[id]
        return (
          <div key={id} className="absolute -translate-x-1/2 -translate-y-1/2" style={{ left: `${p.x}%`, top: `${p.y}%` }}>
            <div
              data-state={st}
              style={stagger(order[id])}
              className={cn(
                'dg-item dg-node flex items-center gap-1.5 whitespace-nowrap rounded-full border-[1.5px] px-3 py-1.5 text-[13px] font-semibold',
                ROLE_CLASS[node.role],
                st === 'now' && 'border-primary ring-4 ring-primary-soft',
                st === 'todo' && 'opacity-45'
              )}
            >
              <span className={cn('text-[11px] font-bold tabular-nums', node.role === 'start' ? 'text-primary-foreground/70' : 'text-ink-muted')}>{k + 1}</span>
              {node.title}
            </div>
          </div>
        )
      })}
    </div>
  )
}

/* ─── Tree (decision ladder) ────────────────────────────────────────────────── */

function TreeBranch({ plan, states, order, t }: LayoutProps & { t: DiagramTreeNode }) {
  const leaves = t.children.filter((c) => c.children.length === 0)
  const inner = t.children.filter((c) => c.children.length > 0)
  const node = plan.nodes[t.id]
  return (
    <div>
      <div data-state={states[t.id]} style={stagger(order[t.id])} className={cn('dg-item dg-node rounded-2xl border-[1.5px]', ROLE_CLASS[node.role], states[t.id] === 'now' && 'border-primary ring-4 ring-primary-soft', states[t.id] === 'todo' && 'opacity-45')}>
        <div className="px-3.5 py-2.5">
          <NodeCard node={node} className="border-0 bg-transparent p-0 ring-0" />
        </div>
        {leaves.length > 0 && (
          <ul className="flex flex-col gap-2 px-3 pb-3">
            {leaves.map((leaf, k) => (
              <li key={leaf.id + k} className="grid grid-cols-[minmax(0,6.5rem)_auto_minmax(0,1fr)] items-center gap-1.5">
                {leaf.via ? <EdgeChip label={leaf.via} i={order[leaf.id]} /> : <span />}
                <ArrowRight aria-hidden className="size-3.5 text-border-strong" strokeWidth={2.5} />
                <NodeCard node={plan.nodes[leaf.id]} state={states[leaf.id]} i={order[leaf.id]} compact />
              </li>
            ))}
          </ul>
        )}
      </div>
      {inner.length === 1 && (
        <>
          <div className="flex flex-col items-center">
            <Connector i={order[inner[0].id]} arrow={!inner[0].via} />
            {inner[0].via && (
              <>
                <EdgeChip label={inner[0].via} i={order[inner[0].id]} />
                <Connector i={order[inner[0].id]} />
              </>
            )}
          </div>
          <TreeBranch plan={plan} states={states} order={order} t={inner[0]} />
        </>
      )}
      {inner.length > 1 && (
        <>
          <Connector i={order[inner[0].id]} tall />
          <Group i={order[inner[0].id]}>
            <div className="grid gap-3 @3xl:grid-cols-2">
              {inner.map((c) => (
                <div key={c.id} className="flex flex-col items-start gap-1.5">
                  {c.via && <EdgeChip label={c.via} i={order[c.id]} />}
                  <div className="w-full">
                    <TreeBranch plan={plan} states={states} order={order} t={c} />
                  </div>
                </div>
              ))}
            </div>
          </Group>
        </>
      )}
    </div>
  )
}

export function TreeLayout(props: LayoutProps & { root: DiagramTreeNode }) {
  return (
    <div className="@container">
      <TreeBranch {...props} t={props.root} />
    </div>
  )
}

/* ─── Lanes (branch and merge) ─────────────────────────────────────────────── */

export function LanesLayout({ plan, states, order, before, lanes, after }: LayoutProps & { before: string[]; lanes: string[][]; after: string[] }) {
  // A decision right before the split reads best as the group's label.
  const splitId = before[before.length - 1]
  const split = splitId ? plan.nodes[splitId] : undefined
  const splitAsLabel = !!split && split.role === 'decision' && split.title.length <= 48 && !split.subtitle
  const lead = splitAsLabel ? before.slice(0, -1) : before
  const single = lanes.every((l) => l.length === 1)
  // Any lane of 3+ steps: draw every lane as a vertical column so the group stays even.
  const columns = lanes.some((l) => l.length >= 3)
  const cols = single ? (lanes.length === 4 ? 'grid-cols-2' : 'grid-cols-1') : columns && lanes.length === 2 ? 'grid-cols-2' : 'grid-cols-1'
  const wideCols = lanes.length >= 4 ? '@3xl:grid-cols-4' : lanes.length === 3 ? '@3xl:grid-cols-3' : '@3xl:grid-cols-2'
  return (
    <div className="@container">
      {lead.map((id) => (
        <div key={id}>
          <NodeCard node={plan.nodes[id]} state={states[id]} i={order[id]} />
          <Connector i={order[id]} tall />
        </div>
      ))}
      <Group label={splitAsLabel ? split!.title : undefined} i={order[lanes[0][0]]}>
        <div className={cn('grid gap-2', cols, wideCols)}>
          {lanes.map((lane, k) =>
            lane.length === 1 ? (
              <NodeCard key={lane[0]} node={plan.nodes[lane[0]]} state={states[lane[0]]} i={order[lane[0]]} className={`dg-lane-${k % 5}`} />
            ) : lane.length === 2 && !columns ? (
              <div key={lane[0]} className="flex items-stretch gap-1.5 @3xl:flex-col">
                <NodeCard node={plan.nodes[lane[0]]} state={states[lane[0]]} i={order[lane[0]]} className={cn('flex-1', `dg-lane-${k % 5}`)} />
                <ArrowRight aria-hidden className="size-3.5 shrink-0 self-center text-border-strong @3xl:rotate-90" strokeWidth={2.5} />
                <NodeCard node={plan.nodes[lane[1]]} state={states[lane[1]]} i={order[lane[1]]} className="flex-1" />
              </div>
            ) : (
              <div key={lane[0]} className="flex flex-col">
                {lane.map((id, j) => (
                  <div key={id}>
                    <NodeCard node={plan.nodes[id]} state={states[id]} i={order[id]} compact className={j === 0 ? `dg-lane-${k % 5}` : undefined} />
                    {j < lane.length - 1 && <Connector i={order[id]} />}
                  </div>
                ))}
              </div>
            )
          )}
        </div>
      </Group>
      {after.map((id) => (
        <div key={id}>
          <Connector i={order[id]} tall />
          <NodeCard node={plan.nodes[id]} state={states[id]} i={order[id]} />
        </div>
      ))}
    </div>
  )
}

/* ─── Hub ───────────────────────────────────────────────────────────────────── */

export function HubLayout({ plan, states, order, centre, spokes }: LayoutProps & { centre: string; spokes: string[] }) {
  const c = plan.nodes[centre]
  return (
    <div className="@container">
      <div data-state={states[centre]} style={stagger(order[centre])} className={cn('dg-item dg-node flex items-center gap-3 rounded-2xl border-[1.5px] px-3.5 py-3', ROLE_CLASS.start, states[centre] === 'now' && 'ring-4 ring-primary-soft')}>
        <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary-foreground/10">
          <Target className="size-5" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold">{c.title}</p>
          <p className="text-[13px] text-primary-foreground/75">{c.subtitle ?? `${spokes.length} parts`}</p>
        </div>
      </div>
      <Connector i={order[centre]} tall />
      <Group i={order[spokes[0]]}>
        <ol className="grid gap-2 @xl:grid-cols-2 @4xl:grid-cols-3">
          {spokes.map((id, k) => (
            <li key={id} data-state={states[id]} style={stagger(order[id])} className={cn('dg-item dg-node flex items-start gap-2.5 rounded-2xl border-[1.5px] px-3 py-2.5', ROLE_CLASS.step, states[id] === 'now' && 'border-primary ring-4 ring-primary-soft', states[id] === 'todo' && 'opacity-45')}>
              <span aria-hidden className="grid h-5 min-w-5 place-items-center rounded-md bg-primary-soft text-[11px] font-bold tabular-nums text-primary">{k + 1}</span>
              <div className="min-w-0">
                <p className="text-[13px] font-semibold leading-snug">{plan.nodes[id].title}</p>
                {plan.nodes[id].subtitle && <p className="mt-0.5 text-xs leading-snug text-ink-muted">{plan.nodes[id].subtitle}</p>}
              </div>
            </li>
          ))}
        </ol>
      </Group>
    </div>
  )
}

/* ─── Compare ───────────────────────────────────────────────────────────────── */

export function CompareLayout({ plan, states, order, chains }: LayoutProps & { chains: string[][] }) {
  return (
    <div className="@container">
      <div className="grid items-start gap-2 @2xl:grid-cols-[1fr_auto_1fr]">
        {chains.map((chain, k) => (
          <div key={chain[0]} className="contents">
            {k > 0 && (
              <div className="flex items-center justify-center gap-2 @2xl:flex-col @2xl:self-center">
                <span aria-hidden className="h-px flex-1 bg-border @2xl:h-auto @2xl:w-px" />
                <span style={stagger(order[chain[0]])} className="dg-item rounded-full border border-border bg-surface-muted px-2.5 py-0.5 text-xs font-bold uppercase tracking-wider text-ink-muted">vs</span>
                <span aria-hidden className="h-px flex-1 bg-border @2xl:h-auto @2xl:w-px" />
              </div>
            )}
            <Group i={order[chain[0]]}>
              {chain.map((id, j) => (
                <div key={id}>
                  <NodeCard node={plan.nodes[id]} state={states[id]} i={order[id]} compact={j > 0} />
                  {j < chain.length - 1 && <Connector i={order[id]} />}
                </div>
              ))}
            </Group>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ─── Loop markers ──────────────────────────────────────────────────────────── */

export function LoopMarkers({ plan }: { plan: DiagramPlan }) {
  if (!plan.loops?.length) return null
  return (
    <ul className="mt-3 flex flex-col gap-1.5">
      {plan.loops.map((l) => (
        <li key={l.from + l.to} className={cn('flex items-start gap-2 rounded-xl px-3 py-2 text-[13px] leading-snug text-foreground', l.kind === 'link' ? 'bg-surface-muted' : 'bg-warning-bg')}>
          {l.kind === 'link' ? <Link2 aria-hidden className="mt-0.5 size-3.5 shrink-0 text-ink-muted" /> : <RotateCcw aria-hidden className="mt-0.5 size-3.5 shrink-0 text-warning" />}
          <span>
            <b className="font-semibold">{plan.nodes[l.from].title}</b> {l.kind === 'link' ? 'links to' : 'loops back to'} <b className="font-semibold">{plan.nodes[l.to].title}</b>
            {l.label ? <span className="text-ink-muted">: {l.label}</span> : null}
          </span>
        </li>
      ))}
    </ul>
  )
}

export function DiagramBody(props: LayoutProps) {
  const l = props.plan.layout
  switch (l.kind) {
    case 'chain':
      return <ChainLayout {...props} steps={l.steps} />
    case 'ring':
      return <RingLayout {...props} steps={l.steps} loopLabel={l.loopLabel} />
    case 'tree':
      return <TreeLayout {...props} root={l.root} />
    case 'lanes':
      return <LanesLayout {...props} before={l.before} lanes={l.lanes} after={l.after} />
    case 'hub':
      return <HubLayout {...props} centre={l.centre} spokes={l.spokes} />
    case 'compare':
      return <CompareLayout {...props} chains={l.chains} />
  }
}
