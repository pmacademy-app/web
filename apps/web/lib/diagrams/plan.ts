/**
 * Native lesson diagrams: the data the content compiler emits for each Mermaid flowchart
 * (`scripts/compiler/diagram-graph.ts`) and `components/diagrams/` renders.
 *
 * Kept free of React and Node imports so both the compiler and the app can use it, and so a
 * future native mobile app can render the same JSON.
 */

export type DiagramRole = 'start' | 'step' | 'decision' | 'goal'

export interface DiagramNode {
  id: string
  title: string
  subtitle?: string
  role: DiagramRole
}

export interface DiagramEdge {
  from: string
  to: string
  label?: string
  dotted?: boolean
}

export interface DiagramTreeNode {
  id: string
  /** Label on the edge from the parent, for example "Yes" or "No / unclear". */
  via?: string
  children: DiagramTreeNode[]
}

export type DiagramLayout =
  | { kind: 'chain'; steps: string[] }
  | { kind: 'ring'; steps: string[]; loopLabel?: string }
  | { kind: 'tree'; root: DiagramTreeNode }
  | { kind: 'lanes'; before: string[]; lanes: string[][]; after: string[] }
  | { kind: 'hub'; centre: string; spokes: string[] }
  | { kind: 'compare'; chains: string[][] }

export interface DiagramLoop {
  from: string
  to: string
  /** loop: goes back to an earlier box. link: a dotted annotation between boxes. */
  kind?: 'loop' | 'link'
  label?: string
}

export interface DiagramPlan {
  version: 1
  /** The mental model or framework the diagram illustrates, when known. */
  title?: string
  direction: 'TD' | 'LR' | 'BT' | 'RL'
  nodes: Record<string, DiagramNode>
  edges: DiagramEdge[]
  layout: DiagramLayout
  /** Arrows drawn as markers under the diagram: loops back, and dotted links. */
  loops?: DiagramLoop[]
}

/** The order a walk-through visits the nodes in, for every layout. */
export function walkOrder(plan: DiagramPlan): string[] {
  const l = plan.layout
  switch (l.kind) {
    case 'chain':
    case 'ring':
      return l.steps
    case 'hub':
      return [l.centre, ...l.spokes]
    case 'lanes':
      return [...l.before, ...l.lanes.flat(), ...l.after]
    case 'compare':
      return l.chains.flat()
    case 'tree': {
      const order: string[] = []
      const visit = (n: DiagramTreeNode) => {
        if (!order.includes(n.id)) order.push(n.id)
        n.children.forEach(visit)
      }
      visit(l.root)
      return order
    }
  }
}

/** Runtime guard for compiled lesson JSON, which is typed loosely. */
export function isDiagramPlan(value: unknown): value is DiagramPlan {
  if (!value || typeof value !== 'object') return false
  const v = value as Partial<DiagramPlan>
  return v.version === 1 && !!v.nodes && typeof v.nodes === 'object' && !!v.layout && typeof v.layout === 'object'
}
