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
    <div className="mermaid-diagram my-6 w-full max-w-full overflow-x-auto rounded-xl border border-border bg-card p-4 sm:p-6">
      {/* min-w-max keeps the diagram at its natural size; mx-auto centers it when it
          fits and lets the container scroll horizontally when it overflows. */}
      <div className="min-w-max mx-auto" dangerouslySetInnerHTML={{ __html: svg }} />
    </div>
  );
}