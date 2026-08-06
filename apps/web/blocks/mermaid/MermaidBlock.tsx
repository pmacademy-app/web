import React from 'react';
import { BlockProps } from '../../renderer/registry';

export default function MermaidBlock({ block }: BlockProps) {
  const svg = typeof block.svg === 'string' ? block.svg : typeof block.staticSvg === 'string' ? block.staticSvg : '';

  // Diagrams are pre-rendered to static SVG at content:compile time. Raw Mermaid
  // source must never reach the browser, so there is no source-fallback path here.
  if (!svg) {
    return null;
  }

  return (
    <div className="mermaid-diagram my-6 overflow-x-auto rounded-xl border border-border bg-muted/40 p-4">
      <div className="mx-auto w-fit" dangerouslySetInnerHTML={{ __html: svg }} />
    </div>
  );
}
