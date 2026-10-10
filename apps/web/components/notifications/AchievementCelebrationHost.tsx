'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import { apiGet, apiPost } from '@/lib/api/client'
import { useApiQuery } from '@/lib/api/hooks'
import {
  ACHIEVEMENT_CELEBRATIONS_PATH,
  type AchievementCelebration,
  type AchievementCelebrationKind,
  type AchievementCelebrationClaimResponse,
} from '@/lib/api/contracts/achievement-celebration'
import { isLessonPath, shouldLaunchDeferredQuickStart } from '@/lib/quick-start/deferred-launch'
import { useQuickStartOptional } from '@/components/quick-start/QuickStartContext'
import type { ReferralStatsResponse } from '@/lib/api/contracts/settings'
import { AchievementCelebrationModal } from '@/components/celebration/AchievementCelebrationModal'
import { ReferralShareModal } from '@/components/referral/ReferralShareModal'

/** The bell's SWR key (NotificationBell.tsx). Sharing it means one request serves both. */
const NOTIFICATIONS_SUMMARY_KEY = '/api/notifications?limit=1'
const REFERRALS_PATH = '/api/referrals'

/** A celebration's "Invite peers" flow: closed, fetching the link, or showing it. */
type ReferralState =
  | { phase: 'idle' }
  | { phase: 'loading' }
  | { phase: 'open'; link: string; source: string; rewardXp?: number }

interface NotificationsSummaryResponse {
  success: boolean
  unreadCount: number
}

interface AchievementCelebrationHostProps {
  /** The server-read Quick Start flag, as passed to `QuickStartProvider`. */
  quickStartCompleted: boolean
}

/**
 * Claims the learner's next unseen achievement celebration and shows it (Growth R1, Task 10).
 *
 * A claim is consumed server-side: the endpoint marks the achievement's notification read
 * and will not return it again. So the host only asks when it could show the answer, and a
 * claimed celebration is held in state until the learner closes it — hidden while a lesson
 * or Quick Start has the screen, never dropped.
 */
export function AchievementCelebrationHost({ quickStartCompleted }: AchievementCelebrationHostProps) {
  const pathname = usePathname()
  const quickStartOpen = useQuickStartOptional()?.isOpen ?? false
  const { data, mutate } = useApiQuery<NotificationsSummaryResponse>(NOTIFICATIONS_SUMMARY_KEY)
  const unreadCount = data?.success && typeof data.unreadCount === 'number' ? data.unreadCount : 0

  const [celebration, setCelebration] = useState<AchievementCelebration | null>(null)
  // The unread count at which the last claim came back empty (or failed). Asking again
  // before that count changes would get the same answer.
  const [emptyAtUnreadCount, setEmptyAtUnreadCount] = useState<number | null>(null)
  // A ref, not state: it must already be set when StrictMode re-runs the effect.
  const claimInFlight = useRef(false)
  const [referral, setReferral] = useState<ReferralState>({ phase: 'idle' })
  // Set on the first invite click: the closing dialog stays clickable while it animates out.
  const inviteStarted = useRef(false)

  const blocked = isLessonPath(pathname) || quickStartOpen || referral.phase !== 'idle'

  useEffect(() => {
    if (blocked || celebration !== null) return
    if (unreadCount <= 0 || unreadCount === emptyAtUnreadCount) return
    if (claimInFlight.current) return
    // A queued Quick Start is about to open on this page; let it have the screen first.
    // Storage is read here, in the effect, never during render.
    if (shouldLaunchDeferredQuickStart({ pathname, isOpen: quickStartOpen, completed: quickStartCompleted })) {
      return
    }

    claimInFlight.current = true
    void (async () => {
      let claimed: AchievementCelebration | null = null
      try {
        const result = await apiPost<AchievementCelebrationClaimResponse>(ACHIEVEMENT_CELEBRATIONS_PATH)
        if (result.ok) claimed = result.data?.celebration ?? null
      } catch {
        // Best-effort: a failed claim is treated like an empty one.
      }
      claimInFlight.current = false

      if (claimed) {
        setCelebration(claimed)
        setEmptyAtUnreadCount(null)
        // The claim marked a notification read, so the bell's count is stale.
        void mutate()
      } else {
        setEmptyAtUnreadCount(unreadCount)
      }
    })()
  }, [blocked, celebration, unreadCount, emptyAtUnreadCount, pathname, quickStartOpen, quickStartCompleted, mutate])

  // Closing clears the held celebration, which lets the effect claim the next one.
  const handleClose = useCallback(() => setCelebration(null), [])

  // Swap, never stack: the celebration closes first, and the referral modal opens only once
  // the link has loaded. The link is fetched on click, not on mount. A failed fetch just ends
  // the flow.
  const handleInvitePeers = useCallback(async (kind: AchievementCelebrationKind) => {
    if (inviteStarted.current) return
    inviteStarted.current = true
    setCelebration(null)
    setReferral({ phase: 'loading' })
    let link: string | null = null
    let rewardXp: number | undefined
    try {
      const result = await apiGet<ReferralStatsResponse>(REFERRALS_PATH)
      if (result.ok) {
        link = result.data?.stats?.referralLink || null
        rewardXp = result.data?.stats?.rewardXp
      }
    } catch {
      // Treated like a failed response.
    }
    if (!link) inviteStarted.current = false
    setReferral(link ? { phase: 'open', link, source: `${kind}_celebration`, rewardXp } : { phase: 'idle' })
  }, [])

  const handleReferralClose = useCallback(() => {
    inviteStarted.current = false
    setReferral({ phase: 'idle' })
  }, [])

  return (
    <>
      <AchievementCelebrationModal
        celebration={blocked ? null : celebration}
        onClose={handleClose}
        onInvitePeers={handleInvitePeers}
      />
      <ReferralShareModal
        isOpen={referral.phase === 'open'}
        onClose={handleReferralClose}
        referralLink={referral.phase === 'open' ? referral.link : ''}
        source={referral.phase === 'open' ? referral.source : undefined}
        rewardXp={referral.phase === 'open' ? referral.rewardXp : undefined}
      />
    </>
  )
}
