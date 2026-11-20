import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { parseFlowchart, planDiagram, splitLabel } from '../../../../scripts/compiler/diagram-graph'
import { walkOrder, isDiagramPlan, type DiagramPlan, type DiagramTreeNode } from '@/lib/diagrams/plan'

// Native lesson diagrams: the compiler turns each Mermaid flowchart into a layout plan that
// components/diagrams renders as designed cards (chain, ring, tree, lanes, hub, compare).

function idsInLayout(plan: DiagramPlan): string[] {
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
      const out: string[] = []
      const visit = (n: DiagramTreeNode) => {
        out.push(n.id)
        n.children.forEach(visit)
      }
      visit(l.root)
      return out
    }
  }
}

describe('splitLabel', () => {
  it('joins wrapped lines into one title', () => {
    expect(splitLabel('Identify the<br/>Riskiest Untested Assumption')).toEqual({ title: 'Identify the Riskiest Untested Assumption' })
  })
  it('splits "Name: question" and drops the trailing colon', () => {
    expect(splitLabel('Strategy Cascade:<br/>Is the bet falsifiable?')).toEqual({ title: 'Strategy Cascade', subtitle: 'Is the bet falsifiable?' })
    expect(splitLabel('Coverage Map Complete: Genuine Testable Definition of Done')).toEqual({ title: 'Coverage Map Complete', subtitle: 'Genuine Testable Definition of Done' })
  })
})

describe('parseFlowchart', () => {
  it('reads node shapes, edge labels, chains on one line and "&" groups', () => {
    const p = parseFlowchart(`graph TD
      A[Start] --> B{Ready?}
      B -->|Yes| C[Go] --> D[Done]
      B -- No --> E[Wait]
      E & C -.-> F((End))
      style A fill:#fff`)!
    expect(p.direction).toBe('TD')
    expect(p.nodes.get('B')).toMatchObject({ label: 'Ready?', decision: true })
    expect(p.edges).toContainEqual({ from: 'B', to: 'C', label: 'Yes' })
    expect(p.edges).toContainEqual({ from: 'B', to: 'E', label: 'No' })
    expect(p.edges).toContainEqual({ from: 'C', to: 'D' })
    expect(p.edges.filter((e) => e.to === 'F').map((e) => e.from).sort()).toEqual(['C', 'E'])
  })
  it('ignores the %%{init}%% theme header', () => {
    expect(parseFlowchart('%%{init: {"theme": "dark"}}%%\ngraph LR\n A --> B')!.edges).toHaveLength(1)
  })
  it('returns null for non-flowcharts', () => {
    expect(parseFlowchart('sequenceDiagram\n A->>B: hi')).toBeNull()
  })
})

describe('planDiagram layouts', () => {
  it('chain', () => {
    const p = planDiagram('graph LR\n A[One] --> B[Two] --> C[Three]', 'Steps')!
    expect(p.layout).toEqual({ kind: 'chain', steps: ['A', 'B', 'C'] })
    expect(p.title).toBe('Steps')
    expect(p.nodes.A.role).toBe('start')
    expect(p.nodes.C.role).toBe('goal')
  })
  it('ring for a short loop back to the start', () => {
    const p = planDiagram('graph LR\n A[Problem] --> B[Understanding]\n B --> C[Decision]\n C --> D[Execution]\n D --> E[Outcome]\n E -.->|feedback loop| A')!
    expect(p.layout).toEqual({ kind: 'ring', steps: ['A', 'B', 'C', 'D', 'E'], loopLabel: 'feedback loop' })
  })
  it('chain with a loop marker when the loop goes to the middle', () => {
    const p = planDiagram('graph LR\n A[a] --> B[b]\n B --> C[c]\n C --> D[d]\n D -.->|again| B')!
    expect(p.layout.kind).toBe('chain')
    expect(p.loops).toEqual([{ from: 'D', to: 'B', kind: 'loop', label: 'again' }])
  })
  it('decision tree with labelled exits', () => {
    const p = planDiagram('graph TD\n A[Q0] --> B{One?}\n B -->|No| C[Out 1]\n B -->|Yes| D{Two?}\n D -->|No| E[Out 2]\n D -->|Yes| F[Out 3]')!
    expect(p.layout.kind).toBe('tree')
    expect(p.nodes.B.role).toBe('decision')
    if (p.layout.kind === 'tree') expect(p.layout.root.children[0].children.map((c) => c.via)).toEqual(['No', 'Yes'])
  })
  it('lanes: split, parallel steps, merge', () => {
    const p = planDiagram('graph TD\n A[Request] --> B{Who?}\n B --> C[User]\n B --> D[Buyer]\n C --> E[Weigh 1]\n D --> F[Weigh 2]\n E --> G[Decide]\n F --> G')!
    expect(p.layout).toEqual({ kind: 'lanes', before: ['A', 'B'], lanes: [['C', 'E'], ['D', 'F']], after: ['G'] })
  })
  it('lanes: many inputs converging', () => {
    const p = planDiagram('graph LR\n A[Reach] --> E[Score]\n B[Impact] --> E\n C[Confidence] --> E\n E --> F[Priority]')!
    expect(p.layout).toEqual({ kind: 'lanes', before: [], lanes: [['A'], ['B'], ['C']], after: ['E', 'F'] })
  })
  it('hub', () => {
    const p = planDiagram('graph TD\n R[Radar] --> A[One]\n R --> B[Two]\n R --> C[Three]')!
    expect(p.layout).toEqual({ kind: 'hub', centre: 'R', spokes: ['A', 'B', 'C'] })
  })
  it('compare: two separate chains', () => {
    const p = planDiagram('graph LR\n A[Wheel] --> B[Car]\n C[Skateboard] --> D[Bike]')!
    expect(p.layout).toEqual({ kind: 'compare', chains: [['A', 'B'], ['C', 'D']] })
  })
  it('a shared outcome reached from several questions stays a tree', () => {
    const p = planDiagram('graph TD\n A[Claim] --> B{One?}\n B -->|No| F[Reject]\n B -->|Yes| C{Two?}\n C -->|No| F\n C -->|Yes| E[Pass]')!
    expect(p.layout.kind).toBe('tree')
  })
  it('treats a dotted forward arrow as a link, not a merge', () => {
    const p = planDiagram('graph TD\n A[Low] --> B[Low trust]\n C[High] --> D[High trust]\n B -.->|calibration| D')!
    expect(p.layout).toEqual({ kind: 'compare', chains: [['A', 'B'], ['C', 'D']] })
    expect(p.loops).toEqual([{ from: 'B', to: 'D', kind: 'link', label: 'calibration' }])
  })
  it('falls back (null) for subgraphs', () => {
    expect(planDiagram('graph TD\n subgraph X\n A --> B\n end')).toBeNull()
  })
})

describe('every lesson diagram', () => {
  const dir = path.resolve(__dirname, '../../../../content/lessons')
  const sources: { where: string; src: string }[] = []
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.md'))) {
    const text = fs.readFileSync(path.join(dir, f), 'utf8').replace(/\r/g, '')
    let k = 0
    for (const m of text.matchAll(/```mermaid\n([\s\S]*?)```/g)) sources.push({ where: `${f}#${++k}`, src: m[1] })
  }

  it('finds the course diagrams', () => {
    expect(sources.length).toBeGreaterThanOrEqual(200)
  })

  it('gives at least 90% of them a native layout', () => {
    const planned = sources.filter((s) => planDiagram(s.src))
    expect(planned.length / sources.length).toBeGreaterThanOrEqual(0.9)
  })

  it('places every node exactly where the plan says, and nowhere unknown', () => {
    for (const { where, src } of sources) {
      const plan = planDiagram(src)
      if (!plan) continue
      expect(isDiagramPlan(plan), where).toBe(true)
      const placed = idsInLayout(plan)
      const known = Object.keys(plan.nodes)
      for (const id of placed) expect(known, `${where} unknown ${id}`).toContain(id)
      expect(new Set(placed).size, `${where} misses nodes`).toBe(known.length)
      expect(walkOrder(plan).length, where).toBe(known.length)
      for (const n of Object.values(plan.nodes)) expect(n.title.length, `${where} empty title`).toBeGreaterThan(0)
    }
  })
})
