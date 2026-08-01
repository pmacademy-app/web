import React from 'react';

export interface BlockProps {
  block: any;
  lessonId: string;
  children?: React.ReactNode;
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
