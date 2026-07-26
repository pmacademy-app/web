/**
 * Design token constants for use in TypeScript (SVG, animation configs).
 * Raw hex values live ONLY here — never in component files.
 * Components reference these constants or CSS variables.
 */

import type { SkillCluster } from '@/types'

// ─── Competency Colors (Sprint 1 §4.3) ───────────────────────────────────────

export const SKILL_COLORS: Record<SkillCluster, string> = {
  discovery:  '#0F766E',
  strategy:   '#1D4ED8',
  design:     '#DB2777',
  execution:  '#7C3AED',
  growth:     '#16A34A',
  leadership: '#D97706',
  technical:  '#475569',
}

export const SKILL_LABELS: Record<SkillCluster, string> = {
  discovery:  'Discovery & Research',
  strategy:   'Strategy',
  design:     'Design & UX',
  execution:  'Execution & Delivery',
  growth:     'Metrics & Growth',
  leadership: 'Leadership & Communication',
  technical:  'Technical Fluency',
}

/** Ordered array for consistent radar axis rendering. */
export const SKILL_CLUSTERS: SkillCluster[] = [
  'discovery',
  'strategy',
  'design',
  'execution',
  'growth',
  'leadership',
  'technical',
]

// ─── Motion (Sprint 1 §12) ────────────────────────────────────────────────────

export const DURATION = {
  FAST:     0.12,
  STANDARD: 0.18,
  COMPLEX:  0.24,
  MILESTONE: 0.55,
} as const

export const EASING = {
  OUT:    [0.0, 0.0, 0.2, 1.0] as [number, number, number, number],
  IN:     [0.4, 0.0, 1.0, 1.0] as [number, number, number, number],
  IN_OUT: [0.4, 0.0, 0.2, 1.0] as [number, number, number, number],
} as const

// ─── Breakpoints (Sprint 1 §7) ────────────────────────────────────────────────

export const BREAKPOINTS = {
  XS:  360,
  SM:  640,
  MD:  768,
  LG:  1024,
  XL:  1280,
  XXL: 1536,
} as const

// ─── Z-Index layers ───────────────────────────────────────────────────────────

export const Z_INDEX = {
  NAV:     50,
  POPOVER: 60,
  DIALOG:  70,
  TOAST:   80,
} as const
