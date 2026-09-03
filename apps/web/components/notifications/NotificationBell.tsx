'use client'

import React, { useState, useEffect, useRef } from 'react'
import { Bell } from 'lucide-react'
import { NotificationCenterDrawer } from './NotificationCenterDrawer'
import { subscribeClientNotificationEvent } from '@/lib/events/client-event-bus'

const NOTIFICATION_POLL_INTERVAL_MS = 300000 // 5 minutes background heartbeat
const STALE_NOTIFICATION_THRESHOLD_MS = 300000 // Only refresh on tab focus if > 5 minutes old

// Module-level in-flight deduplication promise
let globalNotificationFetchPromise: Promise<number | null> | null = null
let globalLastFetchTime = 0
let globalLastUnreadCount = 0

export function NotificationBell() {
  const [unreadCount, setUnreadCount] = useState<number>(globalLastUnreadCount)
  const [drawerOpen, setDrawerOpen] = useState<boolean>(false)
  const bellContainerRef = useRef<HTMLDivElement>(null)
  const triggerButtonRef = useRef<HTMLButtonElement>(null)

  const drawerOpenRef = useRef<boolean>(false)

  useEffect(() => {
    drawerOpenRef.current = drawerOpen
  }, [drawerOpen])

  const isFetchingRef = useRef<boolean>(false)

  useEffect(() => {
    let mounted = true

    const loadState = async (force = false) => {
      // Avoid duplicate concurrent fetches within component
      if (isFetchingRef.current) return
      // Skip background heartbeat if document is hidden unless explicitly forced
      if (!force && typeof document !== 'undefined' && document.hidden) return
      // Skip if drawer is open and managing its own state
      if (drawerOpenRef.current && !force) return

      // Throttle non-forced requests if recently fetched within 5 seconds
      if (!force && Date.now() - globalLastFetchTime < 5000) return

      isFetchingRef.current = true

      try {
        if (!globalNotificationFetchPromise) {
          globalNotificationFetchPromise = fetch('/api/notifications?limit=1')
            .then(async (res) => {
              if (!res.ok) return null
              const data = await res.json()
              if (data.success && typeof data.unreadCount === 'number') {
                globalLastFetchTime = Date.now()
                globalLastUnreadCount = data.unreadCount
                return data.unreadCount
              }
              return null
            })
            .catch((err) => {
              console.warn('[NotificationBell] Error fetching notifications:', err)
              return null
            })
            .finally(() => {
              globalNotificationFetchPromise = null
            })
        }

        const count = await globalNotificationFetchPromise
        if (mounted && count !== null) {
          setUnreadCount(count)
        }
      } finally {
        isFetchingRef.current = false
      }
    }

    // Initial mount load
    void loadState(true)

    // Event-driven real-time refresh (fires when badges/milestones/events occur)
    const unsubscribe = subscribeClientNotificationEvent(() => {
      void loadState(true)
    })

    // Relaxed periodic heartbeat (5 minutes)
    const interval = setInterval(() => {
      void loadState()
    }, NOTIFICATION_POLL_INTERVAL_MS)

    // Smart visibility change handler: refresh on tab focus ONLY if data is stale (> 5 minutes)
    const handleVisibilityChange = () => {
      if (typeof document === 'undefined') return
      if (document.visibilityState === 'visible' && !drawerOpenRef.current) {
        const elapsed = Date.now() - globalLastFetchTime
        if (elapsed >= STALE_NOTIFICATION_THRESHOLD_MS) {
          void loadState(true)
        }
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      mounted = false
      unsubscribe()
      clearInterval(interval)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [])

  const handleCloseDrawer = () => {
    setDrawerOpen(false)
    setTimeout(() => {
      triggerButtonRef.current?.focus()
    }, 50)
  }

  return (
    <div ref={bellContainerRef} className="relative inline-block">
      {/* Bell Trigger Button */}
      <button
        ref={triggerButtonRef}
        type="button"
        onClick={() => setDrawerOpen((prev) => !prev)}
        aria-label={`Notifications (${unreadCount} unread update${unreadCount === 1 ? '' : 's'})`}
        aria-expanded={drawerOpen}
        aria-haspopup="dialog"
        className="relative p-2 rounded-full border border-border bg-card hover:bg-secondary/40 text-foreground transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 flex items-center justify-center"
      >
        <Bell className="w-4 h-4 text-muted-foreground group-hover:text-foreground" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 min-w-4 h-4 px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-extrabold flex items-center justify-center border-2 border-background animate-in zoom-in duration-150 motion-reduce:animate-none">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Notification Center Popover Panel */}
      <NotificationCenterDrawer
        isOpen={drawerOpen}
        onClose={handleCloseDrawer}
        onUnreadCountChange={(cnt) => {
          globalLastUnreadCount = cnt
          setUnreadCount(cnt)
        }}
        containerRef={bellContainerRef}
      />
    </div>
  )
}

