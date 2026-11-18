'use client'

import { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import { useQuickStart } from '@/components/quick-start/QuickStartContext'
import { useSearch } from '@/components/search/SearchOverlayProvider'

/**
 * On-demand modal bodies for the app shell and the lesson page (perf plan item 5).
 *
 * These dialogs used to be imported statically, so about 2,000 lines of closed popups were
 * downloaded and parsed on every app page. Each one is now its own chunk, fetched the first
 * time it opens. Their triggers and listeners (the Ctrl K shortcut, the feedback prompt
 * event, the celebration claim) stay eager in their hosts, which decide when to mount these.
 *
 * `ssr: false` because a closed dialog renders nothing on the server anyway, and it is only
 * allowed in a client module, which is why the wrappers live here. `loading` is null: a
 * dialog that is still downloading shows nothing rather than a skeleton.
 */

const importSearchOverlay = () => import('@/components/search/SearchOverlay')
const importQuickStartModal = () => import('@/components/quick-start/QuickStartModal')

export const SearchOverlayLazy = dynamic(
  () => importSearchOverlay().then((mod) => mod.SearchOverlay),
  { ssr: false, loading: () => null },
)

export const QuickStartModalLazy = dynamic(
  () => importQuickStartModal().then((mod) => mod.QuickStartModal),
  { ssr: false, loading: () => null },
)

export const AchievementCelebrationModalLazy = dynamic(
  () => import('@/components/celebration/AchievementCelebrationModal').then((mod) => mod.AchievementCelebrationModal),
  { ssr: false, loading: () => null },
)

export const ReferralShareModalLazy = dynamic(
  () => import('@/components/referral/ReferralShareModal').then((mod) => mod.ReferralShareModal),
  { ssr: false, loading: () => null },
)

export const ContextualFeedbackModalLazy = dynamic(
  () => import('@/components/feedback/ContextualFeedbackModal').then((mod) => mod.ContextualFeedbackModal),
  { ssr: false, loading: () => null },
)

export const FirstSessionCelebrationModalLazy = dynamic(
  () => import('@/components/celebration/FirstSessionCelebrationModal').then((mod) => mod.FirstSessionCelebrationModal),
  { ssr: false, loading: () => null },
)

export const ReferralInviteLauncherLazy = dynamic(
  () => import('@/components/referral/ReferralInviteLauncher').then((mod) => mod.ReferralInviteLauncher),
  { ssr: false, loading: () => null },
)

/**
 * True from the first render where `open` is true, and stays true.
 *
 * A modal is mounted once it has opened and is then kept mounted, so its close animation,
 * focus return and internal state behave exactly as when it was always mounted. Until the
 * first open, nothing is mounted and its chunk is never requested.
 */
export function useOpenedOnce(open: boolean): boolean {
  const [opened, setOpened] = useState(open)
  if (open && !opened) setOpened(true)
  return opened || open
}

/** Selectors for the buttons that open search (Sidebar and Topbar). */
const SEARCH_TRIGGER_SELECTOR =
  '#sidebar-search-trigger-btn, #sidebar-search-trigger-btn-collapsed, #topbar-mobile-search-btn'

/**
 * Mounts the search overlay on its first open.
 *
 * The overlay's chunk is preloaded as soon as the learner shows intent, so it opens without
 * a visible wait: pressing Ctrl or Cmd (the first half of the Ctrl K shortcut), or pointing
 * at or focusing a search button. The shortcut itself still lives in `SearchOverlayProvider`.
 */
export function SearchOverlayHost() {
  const { isOpen } = useSearch()
  const opened = useOpenedOnce(isOpen)

  useEffect(() => {
    if (opened) return
    const preload = () => {
      void importSearchOverlay()
      cleanup()
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Control' || e.key === 'Meta' || e.ctrlKey || e.metaKey) preload()
    }
    const onIntent = (e: Event) => {
      const target = e.target
      if (target instanceof Element && target.closest(SEARCH_TRIGGER_SELECTOR)) preload()
    }
    const cleanup = () => {
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('pointerover', onIntent)
      document.removeEventListener('focusin', onIntent)
    }
    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('pointerover', onIntent)
    document.addEventListener('focusin', onIntent)
    return cleanup
  }, [opened])

  return opened ? <SearchOverlayLazy /> : null
}

/**
 * Mounts the Quick Start tour on its first open.
 *
 * Most learners have finished or skipped the tour, and it no longer auto-launches, so for
 * them it never opens and its chunk is never fetched. It cannot simply be left out when the
 * server says it is complete: the Topbar and Profile settings can reopen it manually.
 */
export function QuickStartModalHost() {
  const { isOpen } = useQuickStart()
  const opened = useOpenedOnce(isOpen)
  return opened ? <QuickStartModalLazy /> : null
}
