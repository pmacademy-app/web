import React from 'react';
import type { CompiledBlock } from '@/types';

export interface BlockProps {
  block: CompiledBlock;
  lessonId: string;
  children?: React.ReactNode;
  /**
   * True when the block tree is rendered in a read-only preview (e.g. the
   * admin lesson preview). Interactive blocks must not persist progress or
   * award XP in this mode.
   */
  previewMode?: boolean;
}
