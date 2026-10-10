'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ArrowRight, Medal, Sparkles, TrendingUp, UserPlus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ReferralShareModal } from '@/components/referral/ReferralShareModal'
import { useApiQuery } from '@/lib/api/hooks'
import type { ReferralStatsResponse } from '@/lib/api/contracts/settings'
import { trackDashboardProofCardClicked } from '@/lib/analytics'
import { REFERRAL_REWARD_XP } from '@/lib/referral/reward'
import type { PortfolioState } from '@/lib/dashboard/proof-card'
import type { FellowSummary, ProofExtras } from '@/lib/dashboard/proof-extras'

export type { ProofExtras }

type Action = Parameters<typeof trackDashboardProofCardClicked>[0]

const FELLOW_HREF = '/settings?tab=portfolio'
const ROW = 'mt-5 pt-4 border-t border-border/60 grid grid-cols-2 md:grid-cols-4 gap-4'
const CELL = 'min-w-0 flex flex-col gap-1'
const LABEL = 'text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5'
const VALUE = 'text-xs font-semibold text-foreground leading-snug'
const LINK =
  'inline-flex items-center gap-1 text-xs font-bold text-primary hover:text-primary/80 transition-colors rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50'

// Fellow is a distinction, never a certificate or credential.
function fellowCopy(fellow: FellowSummary): { text: string; cta: { label: string; action: Action } | null } {
  switch (fellow.state) {
    case 'approved':
      return { text: "You're a PM Fellow", cta: null }
    case 'pending':
      return { text: 'Fellow request under review', cta: { label: 'View request', action: 'view_fellow_readiness' } }
    case 'eligible':
      return { text: 'You qualify for PM Fellow', cta: { label: 'Request Fellow', action: 'request_fellow' } }
    case 'rejected':
      return {
        text: `Portfolio ${fellow.readinessPercent}% ready. Strengthen it to request again.`,
        cta: { label: 'See checklist', action: 'view_fellow_readiness' },
      }
    case 'not_eligible':
      return {
        text: `Portfolio ${fellow.readinessPercent}% ready for PM Fellow`,
        cta: { label: 'See checklist', action: 'view_fellow_readiness' },
      }
  }
}

/**
 * Opens the referral modal with source "dashboard". The link is fetched only after the click
 * (a null SWR key until then). SWR keeps a failed fetch's error in its cache, so a failure is
 * shown inline and retried with mutate(); a failed background refetch never closes an open modal.
 */
function InvitePeers({ portfolioState }: { portfolioState: PortfolioState }) {
  const [requested, setRequested] = useState(false)
  const { data, error, isLoading, mutate } = useApiQuery<ReferralStatsResponse>(
    requested ? '/api/referrals' : null,
    { revalidateOnFocus: false, shouldRetryOnError: false },
  )
  const link = data?.stats?.referralLink || null
  const loading = requested && !link && isLoading
  const failed = requested && !link && !isLoading && Boolean(error)

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="justify-start px-0 h-auto text-xs font-bold text-primary hover:bg-transparent hover:text-primary/80"
        aria-busy={loading}
        onClick={() => {
          trackDashboardProofCardClicked('invite_peers', portfolioState)
          if (failed) void mutate()
          else setRequested(true)
        }}
      >
        <UserPlus aria-hidden="true" />
        {failed ? 'Try again' : 'Invite peers'}
      </Button>
      <span aria-live="polite" className="text-[11px] text-muted-foreground empty:hidden">
        {loading ? 'Loading your invite link…' : failed ? "Couldn't load your invite link." : ''}
      </span>
      <ReferralShareModal
        isOpen={requested && Boolean(link)}
        onClose={() => setRequested(false)}
        referralLink={link ?? ''}
        source="dashboard"
      />
    </>
  )
}

/** Reserves the row's footprint while ProofExtrasSlot streams in. */
export function ProofExtrasSkeleton() {
  return (
    <div aria-hidden="true" data-testid="proof-extras-skeleton" className={ROW}>
      {[0, 1, 2, 3].map((cell) => (
        <div key={cell} className={CELL}>
          <span className="h-2.5 w-16 rounded bg-muted/50" />
          <span className="h-3.5 w-28 rounded bg-muted/40" />
          <span className="h-3 w-20 rounded bg-muted/30" />
        </div>
      ))}
    </div>
  )
}

/** The proof card's lower row: PM Fellow, badges, level, and an invite entry point. */
export function ProofExtrasRow({ extras, portfolioState }: { extras: ProofExtras; portfolioState: PortfolioState }) {
  const { fellow, badges, level } = extras
  const track = (action: Action) => () => trackDashboardProofCardClicked(action, portfolioState)
  const fellowView = fellow ? fellowCopy(fellow) : null

  return (
    <div
      data-testid="proof-extras"
      className={ROW}
    >
      {fellow && fellowView && (
        <div className={CELL} data-testid="proof-extras-fellow" data-state={fellow.state}>
          <span className={LABEL}>
            <Sparkles className="w-3.5 h-3.5" aria-hidden="true" /> PM Fellow
          </span>
          <span className={VALUE}>{fellowView.text}</span>
          {fellowView.cta && (
            <Link href={FELLOW_HREF} className={LINK} onClick={track(fellowView.cta.action)}>
              {fellowView.cta.label}
              <ArrowRight className="w-3 h-3" aria-hidden="true" />
            </Link>
          )}
        </div>
      )}

      {badges && (
        <div className={CELL} data-testid="proof-extras-badges">
          <span className={LABEL}>
            <Medal className="w-3.5 h-3.5" aria-hidden="true" /> Badges
          </span>
          <span className={VALUE}>
            {badges.earned} of {badges.total} earned
            {badges.latestName && (
              <span className="block font-normal text-muted-foreground">Latest: {badges.latestName}</span>
            )}
          </span>
          <Link href="/badges" className={LINK} onClick={track('view_badges')}>
            View badges
            <ArrowRight className="w-3 h-3" aria-hidden="true" />
          </Link>
        </div>
      )}

      {level && (
        <div className={CELL} data-testid="proof-extras-level">
          <span className={LABEL}>
            <TrendingUp className="w-3.5 h-3.5" aria-hidden="true" /> Your progress
          </span>
          <span className={VALUE}>
            Level {level.level} · {level.title}
            <span className="block font-normal text-muted-foreground">
              {level.isMaxLevel ? 'Top level reached' : `${level.xpRemaining} XP to the next level`}
            </span>
          </span>
          <Link href="/progress/radar" className={LINK} onClick={track('view_progress')}>
            View progress
            <ArrowRight className="w-3 h-3" aria-hidden="true" />
          </Link>
        </div>
      )}

      <div className={CELL}>
        <span className={LABEL}>
          <UserPlus className="w-3.5 h-3.5" aria-hidden="true" /> Peers
        </span>
        <span className={VALUE}>
          Earn +{REFERRAL_REWARD_XP} XP when a peer you invite finishes their first lesson
        </span>
        <InvitePeers portfolioState={portfolioState} />
      </div>
    </div>
  )
}
