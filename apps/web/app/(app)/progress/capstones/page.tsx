import { permanentRedirect } from 'next/navigation'

/**
 * Phase 7 (7.4) — route consolidation.
 *
 * `/progress/capstones` and the top-level `/capstones` were genuine duplicates (both read capstone
 * status). `/capstones` is canonical: it is the richer workspace hub, its `/capstones/[module]`
 * editor lives beneath it, it is the primary-nav entry, and internal links already point at it. This
 * route now issues a permanent (308) redirect so existing bookmarks and deep links keep working
 * while there is a single canonical home.
 * See docs/decisions/ADR-009-phase-7-make-payoff-visible.md.
 */
export default function CapstonesProgressRedirect() {
  permanentRedirect('/capstones')
}
