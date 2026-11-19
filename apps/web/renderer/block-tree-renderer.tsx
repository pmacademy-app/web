// Client block tree used by the admin lesson preview. No 'use client' directive: its only
// importer (components/admin/AdminLessonPreview.tsx) is already a client module. Learner
// lesson pages use renderer/block-tree-server.tsx instead, so this registry (and the
// markdown blocks it pulls in) stays out of their browser bundle.

import React from 'react';
import { useBlockComponent } from './registry';
import '@/blocks/index';
import { BlockErrorBoundary } from './block-error-boundary';

interface Block {
  blockId: string;
  type: string;
  children?: Block[];
  [key: string]: unknown;
}

interface BlockTreeRendererProps {
  blocks: Block[];
  lessonId: string;
  /** Read-only preview mode — blocks must not persist progress or award XP. */
  previewMode?: boolean;
}

export const BlockTreeRenderer = React.memo(function BlockTreeRenderer({ blocks, lessonId, previewMode }: BlockTreeRendererProps) {
  if (!blocks || !Array.isArray(blocks)) return null;
  return (
    <>
      {blocks.map((block) => (
        <BlockErrorBoundary key={block.blockId} blockId={block.blockId} blockType={block.type} lessonId={lessonId}>
          <BlockRenderer block={block} lessonId={lessonId} previewMode={previewMode} />
        </BlockErrorBoundary>
      ))}
    </>
  );
});

const BlockRenderer = React.memo(function BlockRenderer({ block, lessonId, previewMode }: { block: Block; lessonId: string; previewMode?: boolean }) {
  const component = useBlockComponent(block.type);

  if (block.children && Array.isArray(block.children) && block.children.length > 0) {
    return React.createElement(
      component,
      { block, lessonId, previewMode },
      React.createElement(BlockTreeRenderer, { blocks: block.children, lessonId, previewMode })
    );
  }

  return React.createElement(component, { block, lessonId, previewMode });
});
