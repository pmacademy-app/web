/**
 * Data for the capstone wall in the proof section.
 *
 * Derived from HOME_CAPSTONES (config/marketing.ts), which is itself derived from the
 * real capstone definitions, so the wall can never drift from the curriculum. The
 * previous version held four invented showcase artifacts with made-up titles, module
 * names and hex colours; none of that survives here. Plain data, no colours, no hooks.
 *
 * Server-side only in practice: HOME_CAPSTONES pulls in config/capstones.ts.
 */

import { HOME_CAPSTONES, padIndex } from '@/config/marketing'

export interface CapstoneWallItem {
  /** Module slug, stable across renders. */
  id: string
  /** Zero-padded capstone number, "01" to "09". */
  number: string
  /** Homepage-safe capstone title. */
  title: string
  /** Title of the module the capstone closes. */
  module: string
}

export const CAPSTONE_WALL: readonly CapstoneWallItem[] = HOME_CAPSTONES.map((capstone) => ({
  id: capstone.moduleSlug,
  number: padIndex(capstone.number),
  title: capstone.title,
  module: capstone.moduleTitle,
}))
