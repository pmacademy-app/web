'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { BlockProps } from '../../renderer/registry';

export default function MermaidBlock({ block }: BlockProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [svg, setSvg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const source = block.source || '';

  useEffect(() => {
    let active = true;

    async function renderDiagram() {
      try {
        setLoading(true);
        setError(null);
        
        const { default: mermaid } = await import('mermaid');

        const isDark = typeof document !== 'undefined' ? document.documentElement.classList.contains('dark') : true;
        const resolvedTheme = isDark ? 'dark' : 'light';

        // Blends Resolved Theme colors with Author-provided themeVariables
        const themeVariables: Record<string, string> = {
          background: resolvedTheme === 'dark' ? '#0b0b0c' : '#ffffff',
          primaryColor: resolvedTheme === 'dark' ? '#1f1f23' : '#f4f4f5',
          primaryTextColor: resolvedTheme === 'dark' ? '#ffffff' : '#000000',
          primaryBorderColor: '#8b5cf6',
          lineColor: resolvedTheme === 'dark' ? '#d1d5db' : '#374151',
          textColor: resolvedTheme === 'dark' ? '#ffffff' : '#000000',
          nodeBorder: '#8b5cf6',
          mainBkg: resolvedTheme === 'dark' ? '#1f1f23' : '#f4f4f5',
          ...block.authorTheme,
        };

        mermaid.initialize({
          startOnLoad: false,
          theme: resolvedTheme === 'dark' ? 'dark' : 'default',
          securityLevel: 'loose',
          themeVariables,
        });

        const uniqueId = `mermaid-block-svg-${Math.random().toString(36).substring(2, 9)}`;
        const { svg: renderedSvg } = await mermaid.render(uniqueId, source);

        if (active) {
          setSvg(renderedSvg);
          setLoading(false);
        }
      } catch (err) {
        console.error('[MermaidBlock] Rendering error:', err);
        if (active) {
          setError((err as Error).message || 'Failed to render Mermaid diagram.');
          setLoading(false);
        }
      }
    }

    renderDiagram();

    return () => {
      active = false;
    };
  }, [source, block.authorTheme]);

  useEffect(() => {
    if (!svg || !containerRef.current) return;
    const adjustSvg = () => {
      const svgEl = containerRef.current?.querySelector('svg');
      if (svgEl) {
        svgEl.setAttribute('width', '100%');
        svgEl.style.maxWidth = '100%';
        svgEl.style.height = 'auto';
      }
    };
    adjustSvg();
    const timer = setTimeout(adjustSvg, 150);
    return () => clearTimeout(timer);
  }, [svg]);

  if (error) {
    return (
      <div className="border border-destructive/20 bg-destructive/5 p-4 rounded-xl my-6">
        <p className="text-xs font-semibold text-destructive mb-2 font-serif">Diagram compilation failed:</p>
        <pre className="text-[10px] overflow-x-auto bg-muted p-2 rounded font-mono text-foreground">{source}</pre>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="mermaid-diagram my-6 flex justify-center items-center overflow-x-auto bg-muted/40 p-4 rounded-xl border border-border min-h-[100px]"
    >
      {loading ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin text-primary" />
          Rendering diagram...
        </div>
      ) : (
        <div className="w-full" dangerouslySetInnerHTML={{ __html: svg || '' }} />
      )}
    </div>
  );
}
