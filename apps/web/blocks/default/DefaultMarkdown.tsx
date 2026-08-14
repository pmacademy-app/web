import React from 'react';
import MarkdownRenderer from '@/components/ui/MarkdownRenderer';
import { BlockProps } from '../../renderer/registry';

// ─── Heading ──────────────────────────────────────────────────────────────────

function HeadingBlock({ level, text }: { level: number; text: string }) {
  // Page header already renders the primary <h1> title.
  // Demote level 1 headings inside the content body to <h2> to enforce a single <h1> per page.
  const effectiveLevel = level === 1 ? 2 : Math.min(Math.max(level, 2), 6);
  const Tag = `h${effectiveLevel}` as 'h2' | 'h3' | 'h4' | 'h5' | 'h6';
  const className = (() => {
    switch (effectiveLevel) {
      case 2: return 'text-2xl font-bold font-serif text-foreground mt-8 mb-3 leading-snug';
      case 3: return 'text-xl font-bold font-serif text-foreground mt-7 mb-2.5 leading-snug';
      case 4: return 'text-lg font-bold font-serif text-foreground mt-5 mb-2';
      case 5: return 'text-base font-bold text-foreground mt-4 mb-1.5';
      case 6: return 'text-sm font-bold text-muted-foreground uppercase tracking-wide mt-4 mb-1.5';
      default: return 'text-xl font-bold font-serif text-foreground mt-7 mb-2.5';
    }
  })();

  return (
    <Tag className={className}>
      <MarkdownRenderer content={text} className="inline [&>p]:inline [&>p]:m-0" />
    </Tag>
  );
}

// ─── NativeTable ──────────────────────────────────────────────────────────────

function NativeTable({ headers, rows }: { headers: string[]; rows: string[][] }) {
  return (
    <div className="my-6 overflow-x-auto rounded-xl border border-border shadow-sm">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="bg-muted/60 border-b border-border">
            {headers.map((header, i) => (
              <th
                key={i}
                className="px-4 py-3 text-left font-bold text-foreground text-xs uppercase tracking-wider whitespace-nowrap"
              >
                <MarkdownRenderer content={header} className="inline [&>p]:inline [&>p]:m-0" />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr
              key={ri}
              className={`border-b border-border/60 last:border-0 ${ri % 2 === 0 ? 'bg-card' : 'bg-muted/20'} hover:bg-accent/20 transition-colors`}
            >
              {row.map((cell, ci) => (
                <td key={ci} className="px-4 py-3 text-foreground/85 leading-relaxed align-top">
                  <MarkdownRenderer content={cell} className="inline [&>p]:inline [&>p]:m-0" />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── NativeList ───────────────────────────────────────────────────────────────

function NativeList({ items, ordered }: { items: string[]; ordered: boolean }) {
  const Tag = ordered ? 'ol' : 'ul';
  return (
    <Tag className={`my-4 space-y-2 pl-6 text-sm leading-relaxed text-foreground/85 ${ordered ? 'list-decimal' : 'list-disc'}`}>
      {items.map((item, i) => (
        <li key={i} className="pl-1.5">
          <MarkdownRenderer content={item} className="inline leading-relaxed [&>p]:inline [&>p]:m-0" />
        </li>
      ))}
    </Tag>
  );
}

// ─── Main DefaultMarkdown ─────────────────────────────────────────────────────

export default function DefaultMarkdown({ block }: BlockProps) {
  if (block.type === 'paragraph') {
    return (
      <MarkdownRenderer
        content={block.text as string || ''}
        className="my-3 text-base text-foreground/85 leading-relaxed [&>p]:m-0"
      />
    );
  }

  if (block.type === 'heading') {
    return (
      <HeadingBlock
        level={(block.level as number) || 2}
        text={(block.text as string) || ''}
      />
    );
  }

  if (block.type === 'list') {
    const items = (block.items as string[]) || [];
    const ordered = !!(block.ordered as boolean);
    return <NativeList items={items} ordered={ordered} />;
  }

  if (block.type === 'code') {
    const lang = (block.language as string) || '';
    return (
      <div className="my-5 rounded-xl overflow-hidden border border-border shadow-sm">
        {lang && (
          <div className="bg-muted/80 px-4 py-1.5 border-b border-border flex items-center gap-2">
            <span className="text-[10px] font-mono font-semibold text-muted-foreground uppercase tracking-wider">
              {lang}
            </span>
          </div>
        )}
        <pre className="overflow-x-auto bg-muted/40 p-4 font-mono text-sm leading-relaxed text-foreground">
          <code className={lang ? `language-${lang}` : ''}>
            {(block.code as string) || ''}
          </code>
        </pre>
      </div>
    );
  }

  if (block.type === 'table') {
    const headers = (block.headers as string[]) || [];
    const rows = (block.rows as string[][]) || [];
    return <NativeTable headers={headers} rows={rows} />;
  }

  if (block.type === 'blockquote') {
    const text = (block.text as string) || '';
    return (
      <blockquote className="my-5 pl-4 border-l-4 border-primary/40 italic text-foreground/70 text-base leading-relaxed bg-muted/20 py-3 pr-4 rounded-r-xl">
        <MarkdownRenderer content={text} className="[&>p]:m-0 [&>p]:inline" />
      </blockquote>
    );
  }

  return null;
}
