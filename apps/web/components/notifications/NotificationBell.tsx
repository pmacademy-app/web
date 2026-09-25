'use client'

import React, { useState, useEffect, useRef } from 'react'
import { Bell } from 'lucide-react'
import { NotificationCenterDrawer } from './NotificationCenterDrawer'
import { subscribeClientNotificationEvent } from '@/lib/events/client-event-bus'
import { useApiQuery } from '@/lib/api/hooks'

const NOTIFICATION_POLL_INTERVAL_MS = 300000 // 5 minutes background heartbeat

interface NotificationsSummaryResponse {
  success: boolean
  unreadCount: number
}

export function NotificationBell() {
  const [drawerOpen, setDrawerOpen] = useState<boolean>(false)
  const bellContainerRef = useRef<HTMLDivElement>(null)
  const triggerButtonRef = useRef<HTMLButtonElement>(null)

  const { data, mutate } = useApiQuery<NotificationsSummaryResponse>(
    '/api/notifications?limit=1',
    {
      refreshInterval: drawerOpen ? 0 : NOTIFICATION_POLL_INTERVAL_MS,
      revalidateOnFocus: true,
      dedupingInterval: 5000,
    }
  )

  const unreadCount = data?.success && typeof data.unreadCount === 'number' ? data.unreadCount : 0

  useEffect(() => {
    // Event-driven real-time refresh (fires when badges/milestones/events occur)
    const unsubscribe = subscribeClientNotificationEvent(() => {
      void mutate()
    })
    return () => {
      unsubscribe()
    }
  }, [mutate])

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
        className="relative p-2.5 rounded-lg border border-input bg-card hover:bg-secondary/40 text-foreground transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 flex items-center justify-center min-w-[44px] min-h-[44px]"
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
          void mutate({ success: true, unreadCount: cnt }, false)
        }}
        containerRef={bellContainerRef}
      />
    </div>
  )
}

