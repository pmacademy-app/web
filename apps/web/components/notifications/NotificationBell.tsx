'use client'

import React, { useState, useEffect, useRef } from 'react'
import { Bell } from 'lucide-react'
import { NotificationCenterDrawer } from './NotificationCenterDrawer'
import { subscribeClientNotificationEvent } from '@/lib/events/client-event-bus'

export function NotificationBell() {
  const [unreadCount, setUnreadCount] = useState<number>(0)
  const [drawerOpen, setDrawerOpen] = useState<boolean>(false)
  const bellContainerRef = useRef<HTMLDivElement>(null)
  const triggerButtonRef = useRef<HTMLButtonElement>(null)

  const drawerOpenRef = useRef<boolean>(false)

  useEffect(() => {
    drawerOpenRef.current = drawerOpen
  }, [drawerOpen])

  const lastFetchTimeRef = useRef<number>(0)
  const isFetchingRef = useRef<boolean>(false)

  useEffect(() => {
    let mounted = true

    const loadState = async (force = false) => {
      // Avoid duplicate concurrent fetches
      if (isFetchingRef.current) return
      // Skip background polling if document is hidden unless forced
      if (!force && typeof document !== 'undefined' && document.hidden) return
      // Skip if drawer is open and managing its own state
      if (drawerOpenRef.current && !force) return

      isFetchingRef.current = true
      try {
        const res = await fetch('/api/notifications?limit=1')
        const data = await res.json()
        if (mounted && data.success) {
          setUnreadCount(data.unreadCount || 0)
          lastFetchTimeRef.current = Date.now()
        }
      } catch (err) {
        console.warn('[NotificationBell] Error fetching notifications:', err)
      } finally {
        isFetchingRef.current = false
      }
    }

    void loadState(true)

    const unsubscribe = subscribeClientNotificationEvent(() => {
      void loadState(true)
    })

    // Periodic polling: 60s when visible and drawer is closed
    const interval = setInterval(() => {
      void loadState()
    }, 60000)

    // Visibility change handler: refresh on tab focus if > 60s since last fetch
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && !drawerOpenRef.current) {
        const elapsed = Date.now() - lastFetchTimeRef.current
        if (elapsed >= 60000) {
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
        onUnreadCountChange={(cnt) => setUnreadCount(cnt)}
        containerRef={bellContainerRef}
      />
    </div>
  )
}
