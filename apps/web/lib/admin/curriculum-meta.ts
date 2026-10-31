/**
 * Curriculum module metadata (Phase 4 Learning Workspace).
 *
 * Shared by the admin Curriculum workspace and the learner shell. Module names and
 * descriptions come from `MODULE_META` (lib/curriculum/module-meta.ts), the single
 * source of module titles (D3), so this file only adds presentation details (accent
 * classes and icon). Entries are built in `MODULE_SLUGS` order, so iterating this
 * record yields modules in curriculum order. Module *numbers* are derived from the
 * curriculum order (see `getOrderedModuleSlugs` in curriculum-aggregation.ts).
 */

import { MODULE_META, MODULE_SLUGS, type ModuleSlug } from '@/lib/curriculum/module-meta'

export interface CurriculumModuleMeta {
  slug: string
  name: string
  description: string
  /** Tailwind classes for the module accent chip (bg/text/border). */
  color: string
  /** Tailwind class for the left accent border. */
  accentBorder: string
  /** Icon name used by the learner shell and admin module cards. */
  icon: string
}

const MODULE_ICONS: Readonly<Record<ModuleSlug, string>> = {
  foundations: 'Brain',
  discovery: 'Search',
  design: 'Palette',
  execution: 'Workflow',
  growth: 'TrendingUp',
  leadership: 'Users',
  technical: 'Terminal',
  strategy: 'Target',
  capstone: 'Trophy',
}

const MODULE_COLOR = 'bg-primary/10 text-primary border-primary/20'
const MODULE_ACCENT_BORDER = 'border-l-primary'

export const CURRICULUM_MODULE_META: Record<string, CurriculumModuleMeta> = Object.fromEntries(
  MODULE_SLUGS.map((slug) => [
    slug,
    {
      slug,
      name: MODULE_META[slug].title,
      description: MODULE_META[slug].description,
      color: MODULE_COLOR,
      accentBorder: MODULE_ACCENT_BORDER,
      icon: MODULE_ICONS[slug],
    },
  ]),
)

/** Lookup helper; returns undefined for unknown module slugs. */
export function getCurriculumModuleMeta(slug: string): CurriculumModuleMeta | undefined {
  return CURRICULUM_MODULE_META[slug]
}
