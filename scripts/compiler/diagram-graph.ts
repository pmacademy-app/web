/**
 * Turns a Mermaid flowchart into data the lesson page renders as native, designed
 * diagram components (chain, ring, tree, lanes, hub) instead of a static SVG.
 *
 * Every lesson diagram is a small flowchart (median 5 nodes, max 11), so each one can be
 * laid out to fit a phone without zooming. The layout is decided here, at compile time, so
 * the browser receives a small, ready-to-render structure. When a diagram does not fit any
 * layout, `planDiagram` returns null and the page keeps the compiled SVG.
 */

import type { DiagramEdge, DiagramLayout, DiagramLoop, DiagramNode, DiagramPlan, DiagramRole, DiagramTreeNode } from '../../apps/web/lib/diagrams/plan'

export type { DiagramPlan }

interface RawNode {
  id: string
  label: string
  decision: boolean
}

const SKIP_LINE = /^(style|classDef|class|linkStyle|click|direction)\b/
const NODE_TOKEN = /^([A-Za-z_][\w-]*)\s*(\(\[|\[\[|\[\(|\(\(|\[\/|\[\\|\[|\(|\{\{|\{|>)?/
const CLOSERS: Record<string, string> = {
  '([': '])', '[[': ']]', '[(': ')]', '((': '))', '[/': '/]', '[\\': '\\]', '[': ']', '(': ')', '{{': '}}', '{': '}', '>': ']',
}

function decodeLabel(raw: string): string {
  return raw
    .trim()
    .replace(/^"([\s\S]*)"$/, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&quot;|#quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
}

/**
 * Turns a node label into a title and an optional subtitle. Mermaid line breaks only wrap
 * text, so lines are joined; a "Name: detail" label splits at the colon.
 */
export function splitLabel(label: string): { title: string; subtitle?: string } {
  const text = label
    .split(/<br\s*\/?>/i)
    .map((l) => l.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join(' ')
  const colon = text.match(/^([^:]{3,48}):\s+(.{3,})$/)
  if (colon) return { title: colon[1].trim(), subtitle: colon[2].trim() }
  return { title: text.replace(/:\s*$/, '').trim() }
}

/** Reads one node reference at the start of `s`. Returns the node and the remaining text. */
function readNode(s: string, nodes: Map<string, RawNode>): { id: string; rest: string } | null {
  const m = s.match(NODE_TOKEN)
  if (!m) return null
  const id = m[1]
  let rest = s.slice(m[0].length)
  const open = m[2]
  if (open) {
    const close = CLOSERS[open]
    const end = rest.indexOf(close)
    if (end < 0) return null
    const label = decodeLabel(rest.slice(0, end))
    rest = rest.slice(end + close.length)
    const decision = open === '{' || open === '{{'
    nodes.set(id, { id, label, decision })
  } else if (!nodes.has(id)) {
    nodes.set(id, { id, label: id, decision: false })
  }
  return { id, rest: rest.trimStart() }
}

/** Reads an arrow (with an optional label) at the start of `s`. */
function readArrow(s: string): { label?: string; dotted: boolean; rest: string } | null {
  // -- label --> , -. label .-> , == label ==>
  let m = s.match(/^(--|-\.|==)\s+([^-=.>|][^>]*?)\s+(-->|\.->|==>|---)/)
  if (m) return { label: decodeLabel(m[2]), dotted: m[1] === '-.', rest: s.slice(m[0].length).trimStart() }
  m = s.match(/^(-{2,}>|-{3,}|-\.+->|-\.+-|={2,}>|<-->|--o|--x)/)
  if (!m) return null
  let rest = s.slice(m[0].length).trimStart()
  let label: string | undefined
  const pipe = rest.match(/^\|([^|]*)\|/)
  if (pipe) {
    label = decodeLabel(pipe[1])
    rest = rest.slice(pipe[0].length).trimStart()
  }
  return { label: label || undefined, dotted: m[0].includes('.'), rest }
}

export interface ParsedFlowchart {
  direction: 'TD' | 'LR' | 'BT' | 'RL'
  nodes: Map<string, RawNode>
  edges: DiagramEdge[]
  hasSubgraphs: boolean
}

export function parseFlowchart(source: string): ParsedFlowchart | null {
  const cleaned = source.replace(/\r/g, '').replace(/%%\{[\s\S]*?\}%%/g, '')
  const lines = cleaned.split('\n').map((l) => l.replace(/%%.*$/, '').trim()).filter(Boolean)
  if (lines.length === 0) return null
  const head = lines[0].match(/^(graph|flowchart)\s+(TD|TB|LR|BT|RL)\b/i)
  if (!head) return null
  const dir = head[2].toUpperCase()
  const direction = (dir === 'TB' ? 'TD' : dir) as ParsedFlowchart['direction']
  const nodes = new Map<string, RawNode>()
  const edges: DiagramEdge[] = []
  let hasSubgraphs = false

  for (const line of lines.slice(1)) {
    if (SKIP_LINE.test(line)) continue
    if (/^subgraph\b/.test(line)) {
      hasSubgraphs = true
      continue
    }
    if (line === 'end') continue
    let rest = line.replace(/;$/, '')
    // A line is a chain of node groups joined by arrows. A group may be "A & B".
    let prev: string[] | null = null
    let pendingArrow: { label?: string; dotted: boolean } = { dotted: false }
    let guard = 0
    while (rest && guard++ < 40) {
      const group: string[] = []
      while (true) {
        const n = readNode(rest, nodes)
        if (!n) return null
        group.push(n.id)
        rest = n.rest
        if (rest.startsWith('&')) {
          rest = rest.slice(1).trimStart()
          continue
        }
        break
      }
      if (prev) {
        for (const a of prev) for (const b of group) edges.push({ ...pendingArrow, from: a, to: b })
      }
      if (!rest) break
      const arrow = readArrow(rest)
      if (!arrow) return null
      pendingArrow = { label: arrow.label, dotted: arrow.dotted }
      rest = arrow.rest
      prev = group
    }
  }
  if (nodes.size === 0) return null
  const clean = (l?: string) => (l ? splitLabel(l).title + (splitLabel(l).subtitle ? ': ' + splitLabel(l).subtitle : '') : '')
  return { direction, nodes, edges: edges.map((e) => ({ from: e.from, to: e.to, ...(clean(e.label) ? { label: clean(e.label) } : {}), ...(e.dotted ? { dotted: true } : {}) })), hasSubgraphs }
}

/* ─── Layout planning ─────────────────────────────────────────────────────── */

function adjacency(ids: string[], edges: DiagramEdge[]) {
  const out = new Map<string, DiagramEdge[]>()
  const inn = new Map<string, DiagramEdge[]>()
  for (const id of ids) {
    out.set(id, [])
    inn.set(id, [])
  }
  for (const e of edges) {
    out.get(e.from)!.push(e)
    inn.get(e.to)!.push(e)
  }
  return { out, inn }
}

/** Follows single-successor links from `start` until a node branches, merges or repeats. */
function walkChain(start: string, out: Map<string, DiagramEdge[]>, inn: Map<string, DiagramEdge[]>, stopAtMerge = true): string[] {
  const path = [start]
  let cur = start
  while (out.get(cur)!.length === 1) {
    const next = out.get(cur)![0].to
    if (path.includes(next)) break
    if (stopAtMerge && inn.get(next)!.length > 1) break
    path.push(next)
    cur = next
  }
  return path
}

function buildTree(id: string, via: string | undefined, out: Map<string, DiagramEdge[]>, seen: Set<string>): DiagramTreeNode | null {
  // A shared outcome (a leaf reached from several questions) may appear more than once.
  if (seen.has(id) && out.get(id)!.length > 0) return null
  seen.add(id)
  const children: DiagramTreeNode[] = []
  for (const e of out.get(id)!) {
    const child = buildTree(e.to, e.label, out, seen)
    if (!child) return null
    children.push(child)
  }
  return { id, via, children }
}

export function planLayout(ids: string[], edges: DiagramEdge[]): DiagramLayout | null {
  const { out, inn } = adjacency(ids, edges)
  const roots = ids.filter((id) => inn.get(id)!.length === 0)
  if (roots.length === 0) return null
  if (roots.length > 1) return planMultiRoot(ids, roots, out, inn)
  const root = roots[0]
  const maxOut = Math.max(0, ...ids.map((id) => out.get(id)!.length))
  const maxIn = Math.max(0, ...ids.map((id) => inn.get(id)!.length))

  // Chain
  if (maxOut <= 1 && maxIn <= 1) {
    const path = walkChain(root, out, inn)
    return path.length === ids.length ? { kind: 'chain', steps: path } : null
  }

  // Hub: one centre whose children are all leaves
  const rootOut = out.get(root)!
  if (rootOut.length >= 3 && rootOut.length === edges.length) {
    return { kind: 'hub', centre: root, spokes: rootOut.map((e) => e.to) }
  }

  // Tree: no node has more than one parent
  if (maxIn <= 1) {
    const tree = buildTree(root, undefined, out, new Set())
    return tree ? { kind: 'tree', root: tree } : null
  }

  const lanes = planLanes(ids, root, out, inn)
  if (lanes) return lanes

  // Decision tree whose questions share an outcome (a leaf with several parents)
  if (ids.every((id) => inn.get(id)!.length <= 1 || out.get(id)!.length === 0)) {
    const tree = buildTree(root, undefined, out, new Set())
    return tree ? { kind: 'tree', root: tree } : null
  }
  return null
}

function planLanes(ids: string[], root: string, out: Map<string, DiagramEdge[]>, inn: Map<string, DiagramEdge[]>): DiagramLayout | null {
  // Lanes: a chain, a split into parallel chains, a merge, then a chain
  const before = walkChain(root, out, inn)
  const split = before[before.length - 1]
  const branches = out.get(split)!
  if (branches.length < 2) return null
  const lanes: string[][] = []
  let merge: string | null = null
  for (const b of branches) {
    if (inn.get(b.to)!.length > 1) return null
    const lane = walkChain(b.to, out, inn)
    const last = lane[lane.length - 1]
    const next = out.get(last)!
    if (next.length > 1) return null
    if (next.length === 1) {
      if (merge && merge !== next[0].to) return null
      merge = next[0].to
    } else if (merge) {
      return null
    }
    lanes.push(lane)
  }
  const after = merge ? walkChain(merge, out, inn, false) : []
  const used = before.length + lanes.reduce((n, l) => n + l.length, 0) + after.length
  if (used !== ids.length) return null
  return { kind: 'lanes', before, lanes, after }
}

/** Several starting points: parallel chains that converge, or separate chains to compare. */
function planMultiRoot(ids: string[], roots: string[], out: Map<string, DiagramEdge[]>, inn: Map<string, DiagramEdge[]>): DiagramLayout | null {
  const lanes = roots.map((r) => walkChain(r, out, inn))
  const ends = lanes.map((l) => out.get(l[l.length - 1])!)
  if (ends.every((e) => e.length === 0)) {
    const used = lanes.reduce((n, l) => n + l.length, 0)
    return used === ids.length && lanes.length <= 3 ? { kind: 'compare', chains: lanes } : null
  }
  if (!ends.every((e) => e.length === 1)) return null
  const merge = ends[0][0].to
  if (!ends.every((e) => e[0].to === merge)) return null
  const after = walkChain(merge, out, inn, false)
  const used = lanes.reduce((n, l) => n + l.length, 0) + after.length
  return used === ids.length ? { kind: 'lanes', before: [], lanes, after } : null
}

/** Merges duplicate edges and drops the dotted half of a two-way pair (A --- B, B -.-> A). */
export function tidyEdges(edges: DiagramEdge[]): DiagramEdge[] {
  const byPair = new Map<string, DiagramEdge>()
  for (const e of edges) {
    if (e.from === e.to) continue
    const key = e.from + '>' + e.to
    const seen = byPair.get(key)
    if (seen) {
      if (!seen.label && e.label) seen.label = e.label
      continue
    }
    byPair.set(key, { ...e })
  }
  const out: DiagramEdge[] = []
  for (const e of byPair.values()) {
    const reverse = byPair.get(e.to + '>' + e.from)
    if (reverse && e.dotted && !reverse.dotted) continue
    if (reverse && e.dotted === reverse.dotted && out.includes(reverse)) continue
    out.push(e)
  }
  return out
}

/** Edges that close a cycle, found by a depth-first walk in source order. */
export function findBackEdges(ids: string[], edges: DiagramEdge[]): DiagramEdge[] {
  const { out } = adjacency(ids, edges)
  const state = new Map<string, 0 | 1 | 2>()
  const back: DiagramEdge[] = []
  const visit = (id: string) => {
    state.set(id, 1)
    for (const e of out.get(id)!) {
      const s = state.get(e.to) ?? 0
      if (s === 1) back.push(e)
      else if (s === 0) visit(e.to)
    }
    state.set(id, 2)
  }
  for (const id of ids) if (!state.get(id)) visit(id)
  return back
}

export function planDiagram(source: string, title?: string): DiagramPlan | null {
  const parsed = parseFlowchart(source)
  if (!parsed || parsed.hasSubgraphs) return null
  const ids = [...parsed.nodes.keys()]
  if (ids.length < 2 || ids.length > 14) return null
  const edges = tidyEdges(parsed.edges)
  const back = findBackEdges(ids, edges)
  let forward = edges.filter((e) => !back.includes(e))
  // Dotted forward arrows are usually annotations ("calibration line"), not steps. Lay the
  // boxes out by the solid arrows when that works, and show dotted ones as link markers.
  const dotted = forward.filter((e) => e.dotted)
  let links: DiagramEdge[] = []
  let layout: DiagramLayout | null = null
  if (dotted.length > 0) {
    const solid = forward.filter((e) => !e.dotted)
    layout = planLayout(ids, solid)
    if (layout) {
      links = dotted
      forward = solid
    }
  }
  if (!layout) layout = planLayout(ids, forward)
  if (!layout) return null

  const loops: DiagramLoop[] = []
  const shortLabels = [...parsed.nodes.values()].every((n) => splitLabel(n.label).title.length <= 16)
  if (back.length === 1 && layout.kind === 'chain' && ids.length <= 7 && shortLabels && (back[0].label ?? '').length <= 24 && back[0].from === layout.steps[layout.steps.length - 1] && back[0].to === layout.steps[0]) {
    layout = { kind: 'ring', steps: layout.steps, loopLabel: back[0].label }
  } else {
    for (const e of back) loops.push({ from: e.from, to: e.to, kind: 'loop', ...(e.label ? { label: e.label } : {}) })
  }
  for (const e of links) loops.push({ from: e.from, to: e.to, kind: 'link', ...(e.label ? { label: e.label } : {}) })

  const { out, inn } = adjacency(ids, forward)
  const nodes: Record<string, DiagramNode> = {}
  for (const raw of parsed.nodes.values()) {
    const { title, subtitle } = splitLabel(raw.label)
    const isDecision = raw.decision || /\?$/.test(title + (subtitle ?? ''))
    const role: DiagramRole =
      inn.get(raw.id)!.length === 0 && (layout.kind !== 'lanes' || layout.before.includes(raw.id)) ? 'start'
        : isDecision ? 'decision'
          : out.get(raw.id)!.length === 0 ? 'goal'
            : 'step'
    nodes[raw.id] = subtitle ? { id: raw.id, title, subtitle, role } : { id: raw.id, title, role }
  }
  const plan: DiagramPlan = { version: 1, direction: parsed.direction, nodes, edges, layout }
  if (title) plan.title = title
  if (loops.length) plan.loops = loops
  return plan
}
