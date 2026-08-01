import React from 'react';
import MarkdownRenderer from '@/components/ui/MarkdownRenderer';
import { BlockProps } from '../../renderer/registry';

export default function DefaultMarkdown({ block }: BlockProps) {
  if (block.type === 'paragraph') {
    return <MarkdownRenderer content={block.text} className="my-4 leading-relaxed" />;
  }
  if (block.type === 'heading') {
    const headingMarkdown = '#'.repeat(block.level) + ' ' + block.text;
    return <MarkdownRenderer content={headingMarkdown} className="my-4 font-serif font-bold text-foreground" />;
  }
  if (block.type === 'list') {
    const listMarkdown = block.items
      .map((item: string) => (block.ordered ? '1. ' : '- ') + item)
      .join('\n');
    return <MarkdownRenderer content={listMarkdown} className="my-4 leading-relaxed" />;
  }
  if (block.type === 'code') {
    const langClass = block.language ? `language-${block.language}` : '';
    return (
      <pre className="overflow-x-auto bg-muted/60 p-4 rounded-lg border border-border my-4 font-mono text-sm leading-relaxed text-foreground">
        <code className={langClass}>{block.code}</code>
      </pre>
    );
  }
  if (block.type === 'table') {
    const mdHeaders = '| ' + block.headers.join(' | ') + ' |';
    const mdDivider = '| ' + block.headers.map(() => '---').join(' | ') + ' |';
    const mdRows = block.rows.map((row: string[]) => '| ' + row.join(' | ') + ' |').join('\n');
    const tableMarkdown = `${mdHeaders}\n${mdDivider}\n${mdRows}`;
    return <MarkdownRenderer content={tableMarkdown} className="my-6 overflow-x-auto" />;
  }
  return null;
}
