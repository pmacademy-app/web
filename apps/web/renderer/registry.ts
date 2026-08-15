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

type BlockComponent = React.ComponentType<BlockProps> | React.LazyExoticComponent<React.ComponentType<BlockProps>>;

const registry = new Map<string, BlockComponent>();

export function registerBlock(type: string, component: BlockComponent) {
  registry.set(type, component);
}

export function useBlockComponent(type: string): BlockComponent {
  const component = registry.get(type);
  if (!component) {
    const defaultComponent = registry.get('__default__');
    if (!defaultComponent) {
      throw new Error(`No default block renderer registered and component type "${type}" has no mapping.`);
    }
    return defaultComponent;
  }
  return component;
}
