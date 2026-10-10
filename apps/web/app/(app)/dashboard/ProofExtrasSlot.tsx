import type { PortfolioState } from '@/lib/dashboard/proof-card'
import type { ProofExtras } from '@/lib/dashboard/proof-extras'
import { ProofExtrasRow } from '@/components/dashboard/ProofExtrasRow'

const UNAVAILABLE: ProofExtras = { fellow: null, badges: null, level: null }

/**
 * Streams the Portfolio & Proof card's lower row (PM Fellow, badges, level, invite).
 *
 * Same pattern as LeaderboardWidgetSlot: the page starts the load alongside its own data and
 * passes the promise down; this resolves it inside a <Suspense> boundary, so the badge and
 * Fellow reads never hold the rest of the page. Never throws: a failed load hides the data
 * cells and keeps the invite entry point.
 */
export async function ProofExtrasSlot({
  extrasPromise,
  portfolioState,
}: {
  extrasPromise: Promise<ProofExtras | null>
  portfolioState: PortfolioState
}) {
  let extras: ProofExtras | null = null
  try {
    extras = await extrasPromise
  } catch (error) {
    console.error('[dashboard] proof card extras failed to load', error)
  }

  return <ProofExtrasRow extras={extras ?? UNAVAILABLE} portfolioState={portfolioState} />
}
