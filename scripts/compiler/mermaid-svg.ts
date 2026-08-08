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
  (global as any).navigator = window.navigator;
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

  if (!window.SVGElement.prototype.getBBox) {
    (window.SVGElement.prototype as any).getBBox = function () {
      const tagName = (this.tagName || '').toLowerCase();
      const text = this.textContent || '';

      // foreignObject elements contain HTML-rendered node labels.
      // Mermaid flowchart-v2 always uses foreignObject for node content
      // regardless of the htmlLabels setting. Measure by collecting inner text.
      if (tagName === 'foreignobject') {
        // Walk the DOM inside the foreignObject to collect all text
        const innerText = this.textContent?.trim() || '';
        if (!innerText) return { x: 0, y: 0, width: 60, height: 34 };
        
        // Estimate dimensions from text content (approximate char width + padding)
        const lines = innerText.split('\n').filter((l: string) => l.trim());
        const maxLineLen = Math.max(...lines.map((l: string) => l.trim().length), 1);
        const width = Math.max(60, Math.min(280, maxLineLen * 7.5 + 32));
        const height = Math.max(34, lines.length * 22 + 16);
        return { x: 0, y: 0, width, height };
      }

      // Measure text/tspan elements
      if (tagName === 'text' || tagName === 'tspan') {
        const tspans = this.getElementsByTagName ? this.getElementsByTagName('tspan') : [];
        if (tagName === 'text' && tspans.length > 0) {
          let maxWidth = 0;
          let totalHeight = 0;
          for (let i = 0; i < tspans.length; i++) {
            const tspanText = tspans[i].textContent || '';
            const w = Math.max(48, tspanText.length * 8.5 + 24);
            if (w > maxWidth) maxWidth = w;
            totalHeight += 20; // 20px per line
          }
          return { x: 0, y: 0, width: maxWidth, height: Math.max(36, totalHeight + 16) };
        }

        // Single line element fallback
        const lines = text.split('\n');
        const maxLen = Math.max(...lines.map((l: string) => l.length), 1);
        const width = Math.max(48, Math.min(360, maxLen * 8.5 + 24));
        const height = Math.max(36, lines.length * 20 + 16);
        return { x: 0, y: 0, width, height };
      }

      // Measure rect shapes (nodes use label-container rects)
      if (tagName === 'rect') {
        const attrW = parseFloat(this.getAttribute('width') || '0');
        const attrH = parseFloat(this.getAttribute('height') || '0');
        if (attrW > 0 && attrH > 0) {
          return {
            x: parseFloat(this.getAttribute('x') || '0'),
            y: parseFloat(this.getAttribute('y') || '0'),
            width: attrW,
            height: attrH,
          };
        }
        // Unmeasured rect: estimate from parent foreignObject text content
        const parent = this.parentElement;
        const innerText = parent?.textContent?.trim() || '';
        if (innerText) {
          const maxLen2 = Math.max(...innerText.split('\n').map((l: string) => l.trim().length), 1);
          return { x: 0, y: 0, width: Math.max(60, maxLen2 * 7.5 + 32), height: 34 };
        }
        return { x: 0, y: 0, width: 60, height: 34 };
      }

      // <g> group elements — typically the node wrappers; measure inner text
      if (tagName === 'g') {
        const innerText = text.trim();
        if (innerText) {
          const lines = innerText.split('\n').filter((l: string) => l.trim());
          const maxLineLen = Math.max(...lines.map((l: string) => l.trim().length), 1);
          const width = Math.max(60, Math.min(280, maxLineLen * 7.5 + 32));
          const height = Math.max(34, lines.length * 22 + 16);
          return { x: 0, y: 0, width, height };
        }
        return { x: 0, y: 0, width: 100, height: 50 };
      }

      // Default fallback
      return { x: 0, y: 0, width: 100, height: 50 };
    };
  }

  if (!window.SVGElement.prototype.getComputedTextLength) {
    (window.SVGElement.prototype as any).getComputedTextLength = function () {
      const text = this.textContent || '';
      return Math.max(48, text.length * 8.5);
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
    },
    sequence: {
      showSequenceNumbers: false,
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
        .replace(/\s+/g, ' ')
        .trim();

      return `<svg ${cleanedAttrs} viewBox="${vbX} ${vbY} ${naturalWidth} ${naturalHeight}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Diagram" class="mermaid-static-svg" style="width: 100%; max-width: ${naturalWidth}px; height: auto; display: block; margin: 0 auto;">`;
    });

  // Inject dark mode overrides right after opening <svg> tag
  processedSvg = processedSvg.replace(/<svg\b([^>]*?)>/i, `$&\n${darkStyleOverrides}`);

  return processedSvg;
}
