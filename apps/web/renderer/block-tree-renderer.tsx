'use client';

import React from 'react';
import { useBlockComponent } from './registry';

interface Block {
  blockId: string;
  type: string;
  children?: Block[];
  [key: string]: unknown;
}

interface BlockTreeRendererProps {
  blocks: Block[];
  lessonId: string;
}

class BlockErrorBoundary extends React.Component<{
  block: Block;
  lessonId: string;
  children: React.ReactNode;
}, { hasError: boolean; error: Error | null }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error(
      `[BlockTreeRenderer] Error in block ${this.props.block.blockId} (type: ${this.props.block.type}) in lesson ${this.props.lessonId}:`,
      error,
      errorInfo
    );
  }

  render() {
    if (this.state.hasError) {
      const { block } = this.props;
      if (block.type === 'mermaid') {
        const source = (block.source as string) || '';
        return (
          <div className="border border-destructive/20 bg-destructive/5 p-4 rounded-xl my-6">
            <p className="text-xs font-semibold text-destructive mb-2">Diagram rendering failed:</p>
            <pre className="text-[10px] overflow-x-auto bg-muted p-2 rounded font-mono">{source}</pre>
          </div>
        );
      }
      return (
        <div className="border border-destructive/20 bg-destructive/5 p-4 rounded-xl text-center text-xs text-destructive my-4">
          This content section couldn&apos;t load — skip to the next one.
        </div>
      );
    }
    return this.props.children;
  }
}

export function BlockTreeRenderer({ blocks, lessonId }: BlockTreeRendererProps) {
  if (!blocks || !Array.isArray(blocks)) return null;
  return (
    <>
      {blocks.map((block) => (
        <BlockErrorBoundary key={block.blockId} block={block} lessonId={lessonId}>
          <BlockRenderer block={block} lessonId={lessonId} />
        </BlockErrorBoundary>
      ))}
    </>
  );
}

function BlockRenderer({ block, lessonId }: { block: Block; lessonId: string }) {
  const component = useBlockComponent(block.type);

  if (block.children && Array.isArray(block.children) && block.children.length > 0) {
    return React.createElement(
      component,
      { block, lessonId },
      React.createElement(BlockTreeRenderer, { blocks: block.children, lessonId })
    );
  }

  return React.createElement(component, { block, lessonId });
}
