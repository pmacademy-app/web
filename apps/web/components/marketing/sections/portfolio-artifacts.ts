/**
 * Data for the capstone wall in the proof section.
 *
 * Derived from HOME_CAPSTONES (config/marketing.ts), which is itself derived from the
 * real capstone definitions, so the wall can never drift from the curriculum. The
 * previous version held four invented showcase artifacts with made-up titles, module
 * names and hex colours; none of that survives here. Plain data, no colours, no hooks.
 *
 * Colour is carried as a skill id only. Callers turn it into `var(--color-skill-<id>)`,
 * so light and dark mode both come from the theme tokens in app/globals.css.
 *
 * Server-side only in practice: HOME_CAPSTONES pulls in config/capstones.ts.
 */

import { HOME_CAPSTONES, padIndex, type HomeCapstoneSkill } from '@/config/marketing'

export interface CapstoneWallItem {
  /** Module slug, stable across renders. */
  id: string
  /** Zero-padded capstone number, "01" to "09". */
  number: string
  /** Homepage-safe capstone title. */
  title: string
  /** Title of the module the capstone closes. */
  module: string
  /** Competency cluster, used for the tile's colour accent. */
  skill: HomeCapstoneSkill
  /** What the learner hands in, as named in the capstone definition ("Full PRD"). */
  deliverableType: string
}

export const CAPSTONE_WALL: readonly CapstoneWallItem[] = HOME_CAPSTONES.map((capstone) => ({
  id: capstone.moduleSlug,
  number: padIndex(capstone.number),
  title: capstone.title,
  module: capstone.moduleTitle,
  skill: capstone.skill,
  deliverableType: capstone.deliverableType,
}))

/** Inline style that exposes a skill's theme colour to a tile as `--skill`. */
export function skillAccent(skill: HomeCapstoneSkill): Record<string, string> {
  return { '--skill': `var(--color-skill-${skill})` }
}
