import React from 'react';
import { BlockProps } from '../../renderer/registry';

interface GlossaryEntry {
  term: string;
  definition: string;
  relatedConcepts?: string[];
  difficulty?: number;
}

export default function GlossaryBlock({ block }: BlockProps) {
  const entries: GlossaryEntry[] = block.entries || [];

  if (entries.length === 0) return null;

  return (
    <div className="my-8 rounded-xl border border-border bg-card p-6 shadow-sm space-y-6">
      <div className="border-b border-border pb-3">
        <h4 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
          Lesson Glossary
        </h4>
      </div>
      <dl className="space-y-6">
        {entries.map((entry, idx) => (
          <div key={idx} className="space-y-1.5">
            <dt className="text-base font-bold text-foreground font-serif leading-snug">
              {entry.term}
            </dt>
            <dd className="text-sm text-foreground/80 leading-relaxed pl-4 border-l-2 border-primary/30">
              {entry.definition}
              {entry.relatedConcepts && entry.relatedConcepts.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5 mt-2">
                  <span className="text-[10px] font-semibold text-muted-foreground uppercase">
                    Related:
                  </span>
                  {entry.relatedConcepts.map((concept, cIdx) => (
                    <span
                      key={cIdx}
                      className="px-1.5 py-0.5 rounded bg-muted text-[10px] text-muted-foreground border border-border"
                    >
                      {concept}
                    </span>
                  ))}
                </div>
              )}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
