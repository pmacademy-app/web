import { permanentRedirect } from 'next/navigation'

/**
 * Phase 7 (7.4) — route consolidation.
 *
 * `/progress/badges` and the top-level `/badges` were genuine duplicates (both rendered
 * `getUserBadgesData`). `/badges` is canonical: it is the richer gallery, it is the primary-nav
 * entry, and most internal links already point at it. This route now issues a permanent (308)
 * redirect so existing bookmarks and deep links keep working while there is a single canonical home.
 * See docs/decisions/ADR-009-phase-7-make-payoff-visible.md.
 */
export default function BadgesProgressRedirect() {
  permanentRedirect('/badges')
}
