import React from 'react';
import MarkdownRenderer from '@/components/ui/MarkdownRenderer';
import { BlockProps } from '../../renderer/registry';

export default function DefaultMarkdown({ block }: BlockProps) {
  if (block.type === 'paragraph') {
    return <MarkdownRenderer content={block.text || ''} className="my-4 leading-relaxed" />;
  }
  if (block.type === 'heading') {
    const headingMarkdown = '#'.repeat(block.level || 1) + ' ' + (block.text || '');
    return <MarkdownRenderer content={headingMarkdown} className="my-4 font-serif font-bold text-foreground" />;
  }
  if (block.type === 'list') {
    const items = (block.items as string[]) || [];
    const listMarkdown = items
      .map((item: string) => (block.ordered ? '1. ' : '- ') + item)
      .join('\n');
    return <MarkdownRenderer content={listMarkdown} className="my-4 leading-relaxed" />;
  }
  if (block.type === 'code') {
    const langClass = block.language ? `language-${block.language}` : '';
    return (
      <pre className="overflow-x-auto bg-muted/60 p-4 rounded-lg border border-border my-4 font-mono text-sm leading-relaxed text-foreground">
        <code className={langClass}>{block.code || ''}</code>
      </pre>
    );
  }
  if (block.type === 'table') {
    const headers = (block.headers as string[]) || [];
    const rows = (block.rows as string[][]) || [];
    const mdHeaders = '| ' + headers.join(' | ') + ' |';
    const mdDivider = '| ' + headers.map(() => '---').join(' | ') + ' |';
    const mdRows = rows.map((row: string[]) => '| ' + row.join(' | ') + ' |').join('\n');
    const tableMarkdown = `${mdHeaders}\n${mdDivider}\n${mdRows}`;
    return <MarkdownRenderer content={tableMarkdown} className="my-6 overflow-x-auto" />;
  }
  return null;
}
