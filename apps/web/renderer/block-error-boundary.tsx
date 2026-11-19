'use client';

import React from 'react';

/**
 * Per-block error boundary shared by the client block tree (admin preview) and the server
 * block tree (lesson pages). It takes only primitives, never the block itself, so wrapping a
 * server-rendered block does not serialize the block's content into the client payload.
 */
interface BlockErrorBoundaryProps {
  blockId: string;
  blockType: string;
  lessonId: string;
  children: React.ReactNode;
}

interface BlockErrorBoundaryState {
  hasError: boolean;
}

export class BlockErrorBoundary extends React.Component<BlockErrorBoundaryProps, BlockErrorBoundaryState> {
  constructor(props: BlockErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): BlockErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error(
      `[BlockTreeRenderer] Error in block ${this.props.blockId} (type: ${this.props.blockType}) in lesson ${this.props.lessonId}:`,
      error,
      errorInfo
    );
  }

  render() {
    if (this.state.hasError) {
      // Never surface raw Mermaid source to the browser, even on render failure.
      if (this.props.blockType === 'mermaid') {
        return (
          <div className="border border-destructive/20 bg-destructive/5 p-4 rounded-xl my-6">
            <p className="text-xs font-semibold text-destructive mb-2">This diagram couldn&apos;t be rendered, skip to the next section.</p>
          </div>
        );
      }
      return (
        <div className="border border-destructive/20 bg-destructive/5 p-4 rounded-xl text-center text-xs text-destructive my-4">
          This content section couldn&apos;t load, skip to the next one.
        </div>
      );
    }
    return this.props.children;
  }
}
