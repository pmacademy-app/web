'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import { apiPost } from '@/lib/api/client'
import { useApiQuery } from '@/lib/api/hooks'
import {
  ACHIEVEMENT_CELEBRATIONS_PATH,
  type AchievementCelebration,
  type AchievementCelebrationClaimResponse,
} from '@/lib/api/contracts/achievement-celebration'
import { isLessonPath, shouldLaunchDeferredQuickStart } from '@/lib/quick-start/deferred-launch'
import { useQuickStartOptional } from '@/components/quick-start/QuickStartContext'
import { AchievementCelebrationModal } from '@/components/celebration/AchievementCelebrationModal'

/** The bell's SWR key (NotificationBell.tsx). Sharing it means one request serves both. */
const NOTIFICATIONS_SUMMARY_KEY = '/api/notifications?limit=1'

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

  const blocked = isLessonPath(pathname) || quickStartOpen

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

  return <AchievementCelebrationModal celebration={blocked ? null : celebration} onClose={handleClose} />
}
