import React from 'react';
import { BlockProps } from '../../renderer/registry';
import DiagramFigure from '@/components/diagrams/DiagramFigure';
import { isDiagramPlan } from '@/lib/diagrams/plan';

export default function MermaidBlock({ block }: BlockProps) {
  // Preferred: the native diagram plan the compiler builds from the flowchart
  // (scripts/compiler/diagram-graph.ts). It covers about 93% of lesson diagrams.
  if (isDiagramPlan(block.graph)) {
    return <DiagramFigure plan={block.graph} title={block.graph.title} />;
  }

  // Fallback: the static SVG the compiler renders. Raw Mermaid source never reaches the
  // browser, so there is no source-fallback path here.
  const svg = typeof block.svg === 'string' ? block.svg : '';
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
