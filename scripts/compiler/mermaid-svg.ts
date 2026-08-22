;
import { pathToFileURL } from 'node:url';
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

let mermaidInstance: any = null;

/**
 * Helper to extract line-separated text from a JSDOM element (HTML or SVG) by converting
 * line-breaking tags (<br>, <div>, <p>, <tspan>, <tr>) into newlines before stripping HTML.
 * JSDOM's textContent strips tags without inserting newlines, causing multiline labels
 * to be measured as 1 giant single line, breaking Mermaid's node bounds & connector routing.
 */
function extractElementLines(element: any): string[] {
  if (!element) return [];

  let html = '';
  try {
    html = element.innerHTML || '';
  } catch {}

  if (typeof html === 'string' && html.length > 0) {
    const textWithNewlines = html
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|tspan|tr|li|h[1-6])>/gi, '\n')
      .replace(/<[^>]+>/g, '');

    const decoded = textWithNewlines
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'");

    const lines = decoded.split('\n').map((l: string) => l.trim()).filter(Boolean);
    if (lines.length > 0) return lines;
  }

  const rawText = (element?.textContent || '').trim();
  return rawText.split('\n').map((l: string) => l.trim()).filter(Boolean);
}

function getJSDOMClass() {
  try {
    return require('jsdom').JSDOM;
  } catch {
    const resolved = require.resolve('jsdom', { paths: [process.cwd(), __dirname, `${process.cwd()}/apps/web`] });
    return require(resolved).JSDOM;
  }
}

async function getMermaid() {
  if (mermaidInstance) return mermaidInstance;

  const JSDOM = getJSDOMClass();
  const dom = new JSDOM('<!DOCTYPE html><html><body><div id="container"></div></body></html>', {
    url: 'http://localhost/',
    contentType: 'text/html',
  });

  const { window } = dom;
  const { document } = window;

  (global as any).window = window;
  (global as any).document = document;
  try {
    (global as any).navigator = window.navigator;
  } catch {
    Object.defineProperty(global, 'navigator', {
      value: window.navigator,
      configurable: true,
      writable: true,
    });
  }
  (global as any).HTMLElement = window.HTMLElement;
  (global as any).SVGElement = window.SVGElement;
  (global as any).Element = window.Element;
  (global as any).Node = window.Node;

  // Polyfill CSSStyleSheet for JSDOM
  if (!(window as any).CSSStyleSheet || !(global as any).CSSStyleSheet) {
    class MockCSSStyleSheet {
      cssRules: any[] = [];
      insertRule(rule: string, index?: number) {
        this.cssRules.push({ cssText: rule });
        return index ?? this.cssRules.length - 1;
      }
      deleteRule() {}
    }
    (window as any).CSSStyleSheet = MockCSSStyleSheet;
    (global as any).CSSStyleSheet = MockCSSStyleSheet;
  }

  // Polyfill getBoundingClientRect for JSDOM elements (used by D3 / Mermaid label layout engine)
  if (!window.Element.prototype.getBoundingClientRect || (window.Element.prototype.getBoundingClientRect as any).__isMock !== true) {
    const mockFn = function (this: any) {
      const lines = extractElementLines(this);
      const maxLen = Math.max(1, ...lines.map((l: string) => l.length));
      const width = Math.max(60, maxLen * 8.5 + 32);
      const height = Math.max(34, Math.max(1, lines.length) * 22 + 16);
      return {
        x: 0,
        y: 0,
        width,
        height,
        top: 0,
        right: width,
        bottom: height,
        left: 0,
        toJSON() { return this; },
      };
    };
    (mockFn as any).__isMock = true;
    window.Element.prototype.getBoundingClientRect = mockFn;
  }

  // Polyfill offsetWidth and offsetHeight for HTMLElement in JSDOM
  try {
    Object.defineProperty(window.HTMLElement.prototype, 'offsetWidth', {
      get() {
        const lines = extractElementLines(this);
        const maxLen = Math.max(1, ...lines.map((l: string) => l.length));
        return Math.max(60, maxLen * 8.5 + 32);
      },
      configurable: true,
    });
    Object.defineProperty(window.HTMLElement.prototype, 'offsetHeight', {
      get() {
        const lines = extractElementLines(this);
        return Math.max(34, Math.max(1, lines.length) * 22 + 16);
      },
      configurable: true,
    });
  } catch {}

  if (!window.SVGElement.prototype.getBBox) {
    (window.SVGElement.prototype as any).getBBox = function (): { x: number; y: number; width: number; height: number } {
      const tagName = (this.tagName || '').toLowerCase();

      // 1. Container elements (<g>, <svg>): compute bounding box union over all children
      if (tagName === 'g' || tagName === 'svg') {
        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;

        const children = this.children || [];
        for (let i = 0; i < children.length; i++) {
          const child = children[i];
          if (!child || typeof child.getBBox !== 'function') continue;

          const box = child.getBBox();
          if (!box || isNaN(box.width) || isNaN(box.height)) continue;

          // Parse transform="translate(tx, ty)" if present on child
          let tx = 0;
          let ty = 0;
          const transformAttr = child.getAttribute('transform') || '';
          const matchTrans = transformAttr.match(/translate\(\s*([\d.-]+)\s*(?:,\s*([\d.-]+))?\s*\)/i);
          if (matchTrans) {
            tx = parseFloat(matchTrans[1]) || 0;
            ty = parseFloat(matchTrans[2] || '0') || 0;
          }

          const childMinX = (box.x || 0) + tx;
          const childMinY = (box.y || 0) + ty;
          const childMaxX = childMinX + (box.width || 0);
          const childMaxY = childMinY + (box.height || 0);

          if (childMinX < minX) minX = childMinX;
          if (childMinY < minY) minY = childMinY;
          if (childMaxX > maxX) maxX = childMaxX;
          if (childMaxY > maxY) maxY = childMaxY;
        }

        if (minX !== Infinity && minY !== Infinity && maxX !== -Infinity && maxY !== -Infinity) {
          return {
            x: minX,
            y: minY,
            width: Math.max(10, maxX - minX),
            height: Math.max(10, maxY - minY),
          };
        }

        // Fallback for empty container: measure inner text if present
        const lines = extractElementLines(this);
        if (lines.length > 0) {
          const maxLineLen = Math.max(...lines.map((l: string) => l.length), 1);
          return { x: 0, y: 0, width: Math.max(60, maxLineLen * 8.5 + 32), height: Math.max(34, lines.length * 24 + 16) };
        }

        return { x: 0, y: 0, width: 100, height: 50 };
      }

      // 2. Leaf elements (foreignObject, text, tspan, rect, circle, polygon, path)
      if (tagName === 'foreignobject') {
        const lines = extractElementLines(this);
        if (lines.length === 0) return { x: 0, y: 0, width: 60, height: 34 };
        const maxLineLen = Math.max(...lines.map((l: string) => l.length), 1);
        const width = Math.max(60, maxLineLen * 8.5 + 32);
        const height = Math.max(34, lines.length * 24 + 16);
        return { x: 0, y: 0, width, height };
      }

      if (tagName === 'text' || tagName === 'tspan') {
        const lines = extractElementLines(this);
        const maxLen = Math.max(...lines.map((l: string) => l.length), 1);
        const width = Math.max(48, maxLen * 8.5 + 24);
        const height = Math.max(36, Math.max(1, lines.length) * 20 + 16);
        return { x: 0, y: 0, width, height };
      }

      if (tagName === 'rect') {
        const attrW = parseFloat(this.getAttribute('width') || '0');
        const attrH = parseFloat(this.getAttribute('height') || '0');
        const x = parseFloat(this.getAttribute('x') || '0');
        const y = parseFloat(this.getAttribute('y') || '0');
        if (attrW > 0 && attrH > 0) {
          return { x, y, width: attrW, height: attrH };
        }
        // If rect is not sized yet, estimate from node label text in parent container
        const parent = this.parentElement || this.parentNode;
        const lines = extractElementLines(parent);
        if (lines.length > 0) {
          const maxLen = Math.max(1, ...lines.map((l: string) => l.length));
          const width = Math.max(60, maxLen * 8.5 + 32);
          const height = Math.max(34, lines.length * 24 + 16);
          return { x: -width / 2, y: -height / 2, width, height };
        }
        return { x: -30, y: -17, width: 60, height: 34 };
      }

      if (tagName === 'polygon') {
        const pointsAttr = this.getAttribute('points') || '';
        const pts = pointsAttr.trim().split(/[\s,]+/).map(parseFloat).filter((n: number) => !isNaN(n));
        if (pts.length >= 2) {
          let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
          for (let i = 0; i < pts.length; i += 2) {
            const px = pts[i];
            const py = pts[i + 1] ?? pts[i];
            if (px < minX) minX = px;
            if (px > maxX) maxX = px;
            if (py < minY) minY = py;
            if (py > maxY) maxY = py;
          }
          if (minX !== Infinity && minY !== Infinity && maxX !== -Infinity && maxY !== -Infinity) {
            return {
              x: minX,
              y: minY,
              width: Math.max(1, maxX - minX),
              height: Math.max(1, maxY - minY),
            };
          }
        }
        return { x: -30, y: -30, width: 60, height: 60 };
      }

      if (tagName === 'ellipse') {
        const rx = parseFloat(this.getAttribute('rx') || '0');
        const ry = parseFloat(this.getAttribute('ry') || '0');
        const cx = parseFloat(this.getAttribute('cx') || '0');
        const cy = parseFloat(this.getAttribute('cy') || '0');
        if (rx > 0 && ry > 0) {
          return { x: cx - rx, y: cy - ry, width: 2 * rx, height: 2 * ry };
        }
        return { x: -30, y: -20, width: 60, height: 40 };
      }

      if (tagName === 'circle') {
        const r = parseFloat(this.getAttribute('r') || '15');
        const cx = parseFloat(this.getAttribute('cx') || '0');
        const cy = parseFloat(this.getAttribute('cy') || '0');
        return { x: cx - r, y: cy - r, width: 2 * r, height: 2 * r };
      }

      return { x: 0, y: 0, width: 60, height: 34 };
    };
  }

  if (!window.SVGElement.prototype.getComputedTextLength) {
    (window.SVGElement.prototype as any).getComputedTextLength = function () {
      const lines = extractElementLines(this);
      const maxLen = Math.max(1, ...lines.map((l: string) => l.length));
      return Math.max(48, maxLen * 8.5);
    };
  }

  let mermaidModule: any;
  try {
    mermaidModule = await import('mermaid');
  } catch {
    const resolved = require.resolve('mermaid', { paths: [process.cwd(), __dirname, `${process.cwd()}/apps/web`] });
    mermaidModule = await import(pathToFileURL(resolved).href);
  }

  const mermaid = mermaidModule.default || mermaidModule;

  const { primary, foreground } = TOKENS.colors;

  mermaid.initialize({
    startOnLoad: false,
    theme: 'base',
    fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    fontSize: 14,
    flowchart: {
      useMaxWidth: true,
      htmlLabels: true,
      curve: 'basis',
      nodeSpacing: 45,
      rankSpacing: 45,
      padding: 16,
    },
    sequence: {
      showSequenceNumbers: false,
      actorMargin: 50,
    },
    themeVariables: {
      darkMode: false,
      background: '#FFFFFF',
      primaryColor: '#FFFFFF',
      primaryBorderColor: primary || '#166534',
      primaryTextColor: foreground || '#1B2A21',
      lineColor: primary || '#166534',
      secondaryColor: '#EFF6F2',
      secondaryBorderColor: primary || '#166534',
      secondaryTextColor: foreground || '#1B2A21',
      tertiaryColor: '#F4F0E6',
      tertiaryBorderColor: '#D1C7BD',
      tertiaryTextColor: '#4B5563',
      nodeBorder: primary || '#166534',
      clusterBkg: '#F4F0E6',
      clusterBorder: '#D1C7BD',
      defaultLinkColor: primary || '#166534',
      titleColor: foreground || '#1B2A21',
      edgeLabelBackground: '#FFFFFF',
      actorBkg: '#FFFFFF',
      actorBorder: primary || '#166534',
      actorTextColor: foreground || '#1B2A21',
      actorLineColor: primary || '#166534',
      signalColor: primary || '#166534',
      signalTextColor: foreground || '#1B2A21',
      labelBoxBkgColor: '#FFFFFF',
      labelBoxBorderColor: primary || '#166534',
      labelTextColor: foreground || '#1B2A21',
      loopTextColor: foreground || '#1B2A21',
      noteBorderColor: primary || '#166534',
      noteBkgColor: '#EFF6F2',
      noteTextColor: foreground || '#1B2A21',
      activationBorderColor: primary || '#166534',
      activationBkgColor: '#EFF6F2',
      sequenceNumberColor: '#FFFFFF',
    },
  });

  mermaidInstance = mermaid;
  return mermaidInstance;
}

let diagramIdCounter = 0;

function cleanSource(source: string): string {
  return source
    .replace(/%%\{init:[\s\S]*?\}%%/gi, '')
    .trim();
}

/**
 * Converts a Mermaid diagram source into a clean, static, responsive SVG string
 * using the official Mermaid layout engine styled with PM Academy green/white design tokens.
 */
export async function compileMermaidToSvg(source: string, _authorTheme?: Record<string, string>): Promise<string> {
  const mermaid = await getMermaid();
  const cleaned = cleanSource(source);

  if (!cleaned) {
    throw new Error(`[Mermaid Compiler Error] Empty diagram source provided.`);
  }

  const id = `mermaid-svg-${Date.now()}-${++diagramIdCounter}`;

  let rawSvg: string;
  try {
    const result = await mermaid.render(id, cleaned);
    rawSvg = result.svg;
  } catch (err: any) {
    throw new Error(`[Mermaid Compiler Error] Failed to render diagram with Mermaid engine:\n${err?.message || err}\nSource:\n${cleaned}`);
  }

  // Parse viewBox / width / height for responsive sizing
  const viewBoxMatch = rawSvg.match(/viewBox="([\d.-]+)\s+([\d.-]+)\s+([\d.]+)\s+([\d.]+)"/i);
  let vbX = 0, vbY = 0, vbWidth = 800, vbHeight = 600;

  if (viewBoxMatch) {
    vbX = parseFloat(viewBoxMatch[1]);
    vbY = parseFloat(viewBoxMatch[2]);
    vbWidth = parseFloat(viewBoxMatch[3]);
    vbHeight = parseFloat(viewBoxMatch[4]);
  } else {
    const wMatch = rawSvg.match(/width="([\d.]+)"/i);
    const hMatch = rawSvg.match(/height="([\d.]+)"/i);
    if (wMatch) vbWidth = parseFloat(wMatch[1]);
    if (hMatch) vbHeight = parseFloat(hMatch[1]);
  }

  const naturalWidth = Math.round(vbWidth * 100) / 100;
  const naturalHeight = Math.round(vbHeight * 100) / 100;

  const darkStyleOverrides = `
  <style>
    .dark .node rect, .dark .node circle, .dark .node ellipse, .dark .node polygon, .dark .node path { fill: #171E1A !important; stroke: #2E4538 !important; }
    .dark .label span, .dark .label text { color: #ECF2EE !important; fill: #ECF2EE !important; }
    .dark .flowchart-link { stroke: #4ADE80 !important; }
    .dark .marker { fill: #4ADE80 !important; stroke: #4ADE80 !important; }
    .dark .edgeLabel { background-color: #171E1A !important; color: #ECF2EE !important; }
    .dark .edgeLabel rect { fill: #171E1A !important; }
    .dark .cluster rect { fill: rgba(255,255,255,0.04) !important; stroke: #2E4538 !important; }
  </style>`;

  // Extract text labels from nodes for screen reader accessibility
  const labelMatches = Array.from(rawSvg.matchAll(/class="[^"]*nodeLabel[^"]*"[^>]*>([\s\S]*?)<\/span>/gi));
  const extractedLabels = labelMatches
    .map((m) => m[1].replace(/<[^>]+>/g, '').trim())
    .filter((txt) => txt.length > 0 && !/^\d+$/.test(txt));

  let accessibleLabel = 'Product process diagram';
  if (extractedLabels.length > 0) {
    const sequence = extractedLabels.slice(0, 5).join(' → ');
    accessibleLabel = `Process diagram showing flow: ${sequence}${extractedLabels.length > 5 ? '...' : ''}`;
  }

  const escapedAriaLabel = accessibleLabel.replace(/"/g, '&quot;');

  // Post-process SVG tag attributes for fluid responsive rendering.
  // Strip all attributes that we will re-set to avoid duplicates (browsers use first occurrence only).
  let processedSvg = rawSvg
    .replace(/<svg\b([^>]*?)>/i, (_match, attrs) => {
      const cleanedAttrs = attrs
        .replace(/\bwidth="[^"]*"/g, '')
        .replace(/\bheight="[^"]*"/g, '')
        .replace(/\bstyle="[^"]*"/g, '')
        .replace(/\bviewBox="[^"]*"/gi, '')
        .replace(/\bpreserveAspectRatio="[^"]*"/g, '')
        .replace(/\bclass="[^"]*"/g, '')
        .replace(/\brole="[^"]*"/g, '')
        .replace(/\baria-roledescription="[^"]*"/g, '')
        .replace(/\baria-label="[^"]*"/g, '')
        .replace(/\s+/g, ' ')
        .trim();

      return `<svg ${cleanedAttrs} width="${naturalWidth}" height="${naturalHeight}" viewBox="${vbX} ${vbY} ${naturalWidth} ${naturalHeight}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="${escapedAriaLabel}" class="mermaid-static-svg" style="width: auto; height: auto; display: block;">\n<title>${accessibleLabel}</title>`;
    });

  // Inject dark mode overrides right after opening <svg> tag
  processedSvg = processedSvg.replace(/<svg\b([^>]*?)>/i, `$&\n${darkStyleOverrides}`);

  return processedSvg;
}
