import { TOKENS } from '../../apps/web/theme/tokens';

export interface MermaidNode {
  id: string;
  label: string;
  shape: 'rect' | 'round' | 'rhombus';
  subgraph?: string;
}

export interface MermaidEdge {
  from: string;
  to: string;
  label?: string;
  dotted?: boolean;
  plain?: boolean;
}

export interface MermaidSubgraph {
  name: string;
  nodeIds: string[];
}

export interface DiagramData {
  type: 'graph' | 'sequence';
  direction: 'TD' | 'LR';
  nodes: MermaidNode[];
  edges: MermaidEdge[];
  subgraphs: MermaidSubgraph[];
}

interface NodeSpec {
  id: string;
  label?: string;
  shape: MermaidNode['shape'];
}

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

const EDGE_SPLIT = /(-\.-+>|-{2,}>|={1,}>|---)(?:\s*\|\s*([^|]*)\s*\|\s*)?/;

function parseNodeSpec(raw: string): NodeSpec | null {
  const m = raw.match(
    /^\s*([A-Za-z0-9_-]+)(?:\s*\[\s*([^\]]*)\]\s*|\s*\(\s*([^)]*)\s*\)\s*|\s*\{\s*([^}]*)\s*\}\s*)?\s*$/
  );
  if (!m) return null;
  const id = m[1];
  let shape: MermaidNode['shape'] = 'rect';
  let label: string | undefined;
  if (m[2] !== undefined) {
    label = m[2];
  } else if (m[3] !== undefined) {
    label = m[3];
    shape = 'round';
  } else if (m[4] !== undefined) {
    label = m[4];
    shape = 'rhombus';
  }
  if (label) {
    label = label.trim();
    if (label.length >= 2 && label.startsWith('"') && label.endsWith('"')) {
      label = label.slice(1, -1);
    }
  }
  return { id, label, shape };
}

/**
 * Parses raw Mermaid diagram source string into a structured graph model.
 * Supports chained edges on one line, rhombus/round/rect node shapes,
 * <br/> multi-line labels, dotted/plain/thick edges and subgraph groups.
 */
export function parseMermaidSource(source: string): DiagramData {
  const lines = source
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith('%%'));

  let direction: 'TD' | 'LR' = 'TD';
  let type: 'graph' | 'sequence' = 'graph';

  const firstLine = lines[0] || '';
  if (firstLine.includes('sequenceDiagram')) {
    type = 'sequence';
  } else if (firstLine.includes('LR')) {
    direction = 'LR';
  }

  const nodesMap = new Map<string, MermaidNode>();
  const edges: MermaidEdge[] = [];
  const subgraphs: MermaidSubgraph[] = [];
  const subgraphStack: string[] = [];

  const getOrCreateNode = (spec: NodeSpec): MermaidNode => {
    const existing = nodesMap.get(spec.id);
    if (existing) {
      if (spec.label) existing.label = spec.label.trim();
      existing.shape = spec.shape;
      return existing;
    }
    const subgraph = subgraphStack.length ? subgraphStack[subgraphStack.length - 1] : undefined;
    const node: MermaidNode = {
      id: spec.id,
      label: spec.label ? spec.label.trim() : spec.id,
      shape: spec.shape,
      subgraph,
    };
    nodesMap.set(spec.id, node);
    if (subgraph) {
      const group = subgraphs.find((s) => s.name === subgraph);
      if (group) group.nodeIds.push(node.id);
    }
    return node;
  };

  for (const line of lines) {
    if (/^(graph|flowchart|sequenceDiagram|mindmap|timeline)\b/.test(line)) continue;
    if (/^end\s*$/.test(line)) {
      subgraphStack.pop();
      continue;
    }
    if (/^subgraph\b/i.test(line)) {
      const name =
        line.replace(/^subgraph\b/i, '').replace(/[\[\]()]/g, '').trim() || `Subgraph ${subgraphs.length + 1}`;
      subgraphs.push({ name, nodeIds: [] });
      subgraphStack.push(name);
      continue;
    }

    const parts = line.split(EDGE_SPLIT);
    let prevNodeId: string | null = null;
    for (let p = 0; p < parts.length; p += 3) {
      const spec = parseNodeSpec(parts[p]);
      if (!spec) continue;
      const node = getOrCreateNode(spec);
      if (prevNodeId && p > 0) {
        const arrow = parts[p - 2] || '';
        let edgeLabel = parts[p - 1];
        if (edgeLabel) {
          edgeLabel = edgeLabel.trim();
          if (edgeLabel.length >= 2 && edgeLabel.startsWith('"') && edgeLabel.endsWith('"')) {
            edgeLabel = edgeLabel.slice(1, -1);
          }
        }
        edges.push({
          from: prevNodeId,
          to: node.id,
          label: edgeLabel || undefined,
          dotted: arrow.includes('.'),
          plain: arrow.startsWith('---'),
        });
      }
      prevNodeId = node.id;
    }
  }

  return {
    type,
    direction,
    nodes: Array.from(nodesMap.values()),
    edges,
    subgraphs,
  };
}

// ---------------------------------------------------------------------------
// Layout & rendering
// ---------------------------------------------------------------------------

const FONT_STACK = `system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif`;
const CHAR_W = 0.6;

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function textWidth(text: string, fontSize: number): number {
  return Array.from(text).length * fontSize * CHAR_W + 1;
}

function wrapToChars(text: string, maxChars: number): string[] {
  const chars = Array.from(text);
  const out: string[] = [];
  for (let i = 0; i < chars.length; i += maxChars) {
    out.push(chars.slice(i, i + maxChars).join(''));
  }
  return out;
}

function splitLabelLines(label: string, fontSize: number): string[] {
  const maxChars = Math.floor(260 / (fontSize * CHAR_W));
  const lines: string[] = [];
  const pushLine = (line: string) => {
    // Guard against single unbroken tokens wider than the wrap threshold —
    // without char-level wrapping they would overflow the node's box.
    lines.push(...(Array.from(line).length > maxChars ? wrapToChars(line, maxChars) : [line]));
  };
  const segments = label.split(/<br\s*\/?>/i);
  for (const seg of segments) {
    const trimmed = seg.replace(/\s+/g, ' ').trim();
    if (!trimmed) continue;
    let current = '';
    for (const word of trimmed.split(' ')) {
      if (current && Array.from(`${current} ${word}`).length > maxChars) {
        pushLine(current);
        current = word;
      } else {
        current = current ? `${current} ${word}` : word;
      }
    }
    if (current) pushLine(current);
  }
  return lines.length ? lines : [' '];
}

interface NodeMeasure {
  lines: string[];
  width: number;
  height: number;
}

function measureNode(node: MermaidNode, scale: number): NodeMeasure {
  const fontSize = 14 * scale;
  const lineHeight = 20 * scale;
  const padX = 20 * scale;
  const padY = 14 * scale;
  const minW = 48 * scale;
  const maxW = 320 * scale;

  const lines = splitLabelLines(node.label, fontSize);
  const maxLine = Math.max(...lines.map((l) => textWidth(l, fontSize)));

  if (node.shape === 'rhombus') {
    return {
      lines,
      width: Math.max(minW + 20 * scale, Math.min(maxLine + 72 * scale, maxW + 60 * scale)),
      height: Math.max(64 * scale, lines.length * lineHeight + 52 * scale),
    };
  }
  return {
    lines,
    width: Math.max(minW, Math.min(maxLine + padX * 2, maxW)),
    height: Math.max(44 * scale, lines.length * lineHeight + padY * 2),
  };
}

interface PlacedNode extends NodeMeasure {
  node: MermaidNode;
  x: number;
  y: number;
}

interface BBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface LayoutResult {
  nodes: PlacedNode[];
  byId: Map<string, PlacedNode>;
  nodeIndex: Map<string, number>;
  bounds: BBox[];
  parts: string[];
  vw: number;
  vh: number;
  scale: number;
}

function computeLayout(diagram: DiagramData, scale: number): LayoutResult {
  const isLR = diagram.direction === 'LR';
  const nodeIndex = new Map<string, number>();
  diagram.nodes.forEach((n, i) => nodeIndex.set(n.id, i));

  const measure = new Map<string, NodeMeasure>();
  for (const node of diagram.nodes) measure.set(node.id, measureNode(node, scale));

  const nodes: PlacedNode[] = [];
  const byId = new Map<string, PlacedNode>();

  const lineHeight = 20 * scale;
  const rowGap = 42 * scale;
  const colGap = 56 * scale;
  const subExtra = 36 * scale;
  const labelFont = 11.5 * scale;

  if (isLR) {
    const rowHeight = Math.max(...diagram.nodes.map((n) => measure.get(n.id)!.height));
    let x = 0;
    let prevSub: string | undefined;
    for (let i = 0; i < diagram.nodes.length; i++) {
      const node = diagram.nodes[i];
      const m = measure.get(node.id)!;
      if (prevSub !== undefined && prevSub !== node.subgraph) x += subExtra;
      const p: PlacedNode = { node, ...m, x, y: (rowHeight - m.height) / 2 };
      nodes.push(p);
      byId.set(node.id, p);
      x += m.width;
      if (i < diagram.nodes.length - 1) {
        const next = diagram.nodes[i + 1];
        let gap = colGap;
        for (const e of diagram.edges) {
          if (e.from === node.id && e.to === next.id && e.label) {
            const labelW = Math.max(...splitLabelLines(e.label, labelFont).map((l) => textWidth(l, labelFont)));
            gap = Math.max(gap, labelW + 44 * scale);
          }
        }
        x += gap;
      }
      prevSub = node.subgraph;
    }
  } else {
    const colWidth = Math.max(...diagram.nodes.map((n) => measure.get(n.id)!.width));
    let y = 0;
    let prevSub: string | undefined;
    for (const node of diagram.nodes) {
      const m = measure.get(node.id)!;
      if (prevSub !== undefined && prevSub !== node.subgraph) y += subExtra;
      nodes.push({ node, ...m, x: (colWidth - m.width) / 2, y });
      byId.set(node.id, nodes[nodes.length - 1]);
      y += m.height + rowGap;
      prevSub = node.subgraph;
    }
  }

  const bounds: BBox[] = nodes.map((p) => ({ x: p.x, y: p.y, width: p.width, height: p.height }));
  const parts: string[] = [];
  let curveCount = 0;

  const addLabel = (label: string, x: number, y: number, anchor: 'middle' | 'start' = 'middle') => {
    const lines = splitLabelLines(label, labelFont);
    const maxW = Math.max(...lines.map((l) => textWidth(l, labelFont)));
    const pillW = maxW + 16 * scale;
    const pillH = lines.length * 14 * scale + 6 * scale;
    const pillX = anchor === 'start' ? x : x - pillW / 2;
    const pillY = y - pillH / 2;
    const baseline = pillY + 12 * scale;
    const tspans = lines
      .map((l, i) => (i === 0 ? `<tspan x="${x}">${escapeXml(l)}</tspan>` : `<tspan x="${x}" dy="${14 * scale}">${escapeXml(l)}</tspan>`))
      .join('');
    parts.push(`<rect x="${pillX}" y="${pillY}" width="${pillW}" height="${pillH}" class="m-label-bg" />`);
    parts.push(`<text x="${x}" y="${baseline}" class="m-label" text-anchor="${anchor}">${tspans}</text>`);
    bounds.push({ x: pillX, y: pillY, width: pillW, height: pillH });
  };

  for (const edge of diagram.edges) {
    const from = byId.get(edge.from);
    const to = byId.get(edge.to);
    if (!from || !to) continue;
    const fIdx = nodeIndex.get(edge.from)!;
    const tIdx = nodeIndex.get(edge.to)!;
    const forwardAdjacent = tIdx === fIdx + 1;

    const edgeClass = edge.plain ? 'm-edge-plain' : edge.dotted ? 'm-edge-dotted' : 'm-edge-line';
    const marker = edge.plain ? 'none' : edge.dotted ? 'url(#arrow-dotted)' : 'url(#arrow)';

    if (isLR) {
      if (forwardAdjacent) {
        const x1 = from.x + from.width;
        const y1 = from.y + from.height / 2;
        const x2 = to.x;
        const y2 = to.y + to.height / 2;
        parts.push(`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" class="${edgeClass}" marker-end="${marker}" />`);
        bounds.push({ x: Math.min(x1, x2), y: Math.min(y1, y2), width: Math.abs(x2 - x1), height: Math.abs(y2 - y1) });
        if (edge.label) addLabel(edge.label, (x1 + x2) / 2, (y1 + y2) / 2 - 18 * scale);
      } else {
        const clearance = (34 + curveCount * 24) * scale;
        curveCount++;
        const startX = from.x + from.width / 2;
        const startY = from.y + from.height + clearance;
        const endX = to.x + to.width / 2;
        const endY = to.y + to.height + clearance;
        const controlY = Math.max(startY, endY) + 40 * scale;
        parts.push(
          `<path d="M ${startX} ${startY} C ${startX} ${controlY}, ${endX} ${controlY}, ${endX} ${endY}" class="${edgeClass}" marker-end="${marker}" />`
        );
        bounds.push({ x: Math.min(startX, endX), y: startY, width: Math.abs(endX - startX), height: controlY - startY });
        if (edge.label) addLabel(edge.label, (startX + endX) / 2, controlY + 18 * scale);
      }
    } else {
      if (forwardAdjacent) {
        const x1 = from.x + from.width / 2;
        const y1 = from.y + from.height;
        const x2 = to.x + to.width / 2;
        const y2 = to.y;
        parts.push(`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" class="${edgeClass}" marker-end="${marker}" />`);
        bounds.push({ x: Math.min(x1, x2), y: Math.min(y1, y2), width: Math.abs(x2 - x1), height: Math.abs(y2 - y1) });
        if (edge.label) addLabel(edge.label, (x1 + x2) / 2, (y1 + y2) / 2 - 18 * scale);
      } else {
        const clearance = (34 + curveCount * 24) * scale;
        curveCount++;
        const startX = from.x + from.width + clearance;
        const startY = from.y + from.height / 2;
        const endX = to.x + to.width + clearance;
        const endY = to.y + to.height / 2;
        const controlX = Math.max(startX, endX) + 40 * scale;
        parts.push(
          `<path d="M ${startX} ${startY} C ${controlX} ${startY}, ${controlX} ${endY}, ${endX} ${endY}" class="${edgeClass}" marker-end="${marker}" />`
        );
        bounds.push({ x: startX, y: Math.min(startY, endY), width: controlX - startX, height: Math.abs(endY - startY) });
        if (edge.label) addLabel(edge.label, controlX + 8 * scale, (startY + endY) / 2, 'start');
      }
    }
  }

  for (const sg of diagram.subgraphs) {
    const groupNodes = sg.nodeIds.map((id) => byId.get(id)).filter((p): p is PlacedNode => !!p);
    if (!groupNodes.length) continue;
    const minX = Math.min(...groupNodes.map((n) => n.x));
    const minY = Math.min(...groupNodes.map((n) => n.y));
    const maxX = Math.max(...groupNodes.map((n) => n.x + n.width));
    const maxY = Math.max(...groupNodes.map((n) => n.y + n.height));
    const pad = 10 * scale;
    const titleH = 22 * scale;
    const x = minX - pad;
    const y = minY - pad - titleH;
    const w = maxX - minX + pad * 2;
    const h = maxY - minY + pad * 2 + titleH;
    parts.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" class="m-subgroup" />`);
    parts.push(`<text x="${minX + pad}" y="${minY - 8 * scale}" class="m-subgroup-title">${escapeXml(sg.name)}</text>`);
    bounds.push({ x, y, width: w, height: h });
  }

  for (const p of nodes) {
    const idx = nodeIndex.get(p.node.id)!;
    const isAccent = idx === 0 || idx === diagram.nodes.length - 1;
    const base = p.node.shape === 'round' ? 'm-node-round' : p.node.shape === 'rhombus' ? 'm-node-rhombus' : 'm-node-rect';
    const cls = isAccent ? `${base}-accent` : base;
    const cx = p.x + p.width / 2;
    const textBaseline = p.y + p.height / 2 - ((p.lines.length - 1) * lineHeight) / 2 + 5 * scale;
    const tspans = p.lines
      .map((l, i) => (i === 0 ? `<tspan x="${cx}">${escapeXml(l)}</tspan>` : `<tspan x="${cx}" dy="${lineHeight}">${escapeXml(l)}</tspan>`))
      .join('');
    if (p.node.shape === 'rhombus') {
      const pts = `${cx},${p.y} ${p.x + p.width},${p.y + p.height / 2} ${cx},${p.y + p.height} ${p.x},${p.y + p.height / 2}`;
      parts.push(`<polygon points="${pts}" class="${cls}" />`);
    } else {
      parts.push(`<rect x="${p.x}" y="${p.y}" width="${p.width}" height="${p.height}" class="${cls}" />`);
    }
    parts.push(`<text x="${cx}" y="${textBaseline}" class="m-text" text-anchor="middle">${tspans}</text>`);
  }

  const minX = Math.min(...bounds.map((b) => b.x), 0);
  const minY = Math.min(...bounds.map((b) => b.y), 0);
  const maxX = Math.max(...bounds.map((b) => b.x + b.width), 0);
  const maxY = Math.max(...bounds.map((b) => b.y + b.height), 0);
  const padding = 26 * scale;
  const vw = maxX - minX + padding * 2;
  const vh = maxY - minY + padding * 2;

  return { nodes, byId, nodeIndex, bounds, parts, vw, vh, scale };
}

/**
 * Converts a Mermaid diagram source into a clean, static, responsive SVG string
 * styled with PM Academy design tokens. Throws if parsing fails or produces zero
 * nodes (failing the build per Requirement 5).
 */
export function compileMermaidToSvg(source: string, authorTheme?: Record<string, string>): string {
  const diagram = parseMermaidSource(source);

  if (diagram.nodes.length === 0) {
    throw new Error(`[Mermaid Compiler Error] Failed to parse diagram. Zero valid nodes extracted from source:\n${source}`);
  }

  // Layout is always computed at the base font size (scale = 1) so every
  // diagram ships with the same 14px/11.5px text. Diagrams wider than the
  // content area shrink proportionally via `max-width:100%` in the SVG style
  // (below) rather than by reducing the font at compile time — this keeps font
  // sizing consistent across diagrams and avoids fixed-width horizontal overflow.
  const layout = computeLayout(diagram, 1);

  const { vw, vh, scale, parts } = layout;
  const nodeFont = 14 * scale;
  const labelFont = 11.5 * scale;

  const px = (n: number) => Math.round(n * 100) / 100;

  const {
    primary,
    accent,
    foreground,
    borderStrong,
  } = TOKENS.colors;
  const dark = TOKENS.colors.dark;
  const nodeBorder = borderStrong;
  const nodeAccentFill = '#EFF6F2';
  const labelBorder = '#E5DFD2';
  const subgroupFill = '#F4F0E6';
  const subgroupText = '#6E726E';

  const style = `
  .m-bg { fill: #FFFFFF; }
  .m-node-rect { fill: #FFFFFF; stroke: ${nodeBorder}; stroke-width: 1.5; rx: 12; }
  .m-node-rect-accent { fill: ${nodeAccentFill}; stroke: ${primary}; stroke-width: 1.5; rx: 12; }
  .m-node-round { fill: #FFFFFF; stroke: ${nodeBorder}; stroke-width: 1.5; rx: 999; }
  .m-node-round-accent { fill: ${nodeAccentFill}; stroke: ${primary}; stroke-width: 1.5; rx: 999; }
  .m-node-rhombus { fill: #FFFFFF; stroke: ${nodeBorder}; stroke-width: 1.5; }
  .m-node-rhombus-accent { fill: ${nodeAccentFill}; stroke: ${primary}; stroke-width: 1.5; }
  .m-text { fill: ${foreground}; font-family: ${FONT_STACK}; font-size: ${px(nodeFont)}px; font-weight: 600; }
  .m-edge-line { stroke: ${primary}; stroke-width: 2; fill: none; }
  .m-edge-dotted { stroke: ${accent}; stroke-width: 2; stroke-dasharray: 5 4; fill: none; }
  .m-edge-plain { stroke: ${nodeBorder}; stroke-width: 1.5; fill: none; }
  .m-label { fill: ${accent}; font-family: ${FONT_STACK}; font-size: ${px(labelFont)}px; font-weight: 700; }
  .m-label-bg { fill: #FFFFFF; stroke: ${labelBorder}; stroke-width: 1; rx: 6; }
  .m-arrow { fill: ${primary}; }
  .m-arrow-dotted { fill: ${accent}; }
  .m-subgroup { fill: ${subgroupFill}; stroke: ${nodeBorder}; stroke-width: 1.5; stroke-dasharray: 5 4; rx: 14; }
  .m-subgroup-title { fill: ${subgroupText}; font-family: ${FONT_STACK}; font-size: ${px(12 * scale)}px; font-weight: 700; letter-spacing: 0.5px; }
  .dark .m-bg { fill: ${dark.surface}; }
  .dark .m-node-rect { fill: ${dark.surfaceMuted}; stroke: ${dark.border}; }
  .dark .m-node-rect-accent { fill: #0E261C; stroke: ${dark.primary}; }
  .dark .m-node-round { fill: ${dark.surfaceMuted}; stroke: ${dark.border}; }
  .dark .m-node-round-accent { fill: #0E261C; stroke: ${dark.primary}; }
  .dark .m-node-rhombus { fill: ${dark.surfaceMuted}; stroke: ${dark.border}; }
  .dark .m-node-rhombus-accent { fill: #0E261C; stroke: ${dark.primary}; }
  .dark .m-text { fill: ${dark.foreground}; }
  .dark .m-edge-line { stroke: ${dark.primary}; }
  .dark .m-edge-dotted { stroke: ${dark.accent}; }
  .dark .m-edge-plain { stroke: ${dark.border}; }
  .dark .m-label { fill: ${dark.accent}; }
  .dark .m-label-bg { fill: ${dark.surface}; stroke: ${dark.border}; }
  .dark .m-arrow { fill: ${dark.primary}; }
  .dark .m-arrow-dotted { fill: ${dark.accent}; }
  .dark .m-subgroup { fill: rgba(255,255,255,0.03); stroke: ${dark.border}; }
  .dark .m-subgroup-title { fill: #9AA09A; }
  `;

  const firstLabel = layout.nodes[0]?.lines[0] || 'diagram';
  const ariaLabel = `${diagram.direction === 'LR' ? 'Flow diagram' : 'Diagram'}: ${firstLabel}`;

  const viewBoxX = px(layout.bounds.length ? Math.min(...layout.bounds.map((b) => b.x), 0) - 26 * scale : 0);
  const viewBoxY = px(layout.bounds.length ? Math.min(...layout.bounds.map((b) => b.y), 0) - 26 * scale : 0);

  // Responsive: render at natural size up to the content area, then shrink
  // proportionally on narrower screens. No fixed/min width — diagrams fit
  // their container without horizontal overflow, clipping, or distortion.
  const styleAttr = `width:${px(vw)}px;max-width:100%;height:auto;display:block;margin:0 auto;`;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBoxX} ${viewBoxY} ${px(vw)} ${px(vh)}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="${escapeXml(ariaLabel)}" class="mermaid-static-svg" style="${styleAttr}height:auto;display:block;margin:0 auto;">
  <style>${style}</style>
  <defs>
    <marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
      <path d="M 0 0 L 10 5 L 0 10 z" class="m-arrow" />
    </marker>
    <marker id="arrow-dotted" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
      <path d="M 0 0 L 10 5 L 0 10 z" class="m-arrow-dotted" />
    </marker>
  </defs>
  <rect x="${viewBoxX}" y="${viewBoxY}" width="${px(vw)}" height="${px(vh)}" class="m-bg" rx="12" />
${parts.join('\n')}
</svg>`;
}
