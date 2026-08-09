'use client'

import React, { useState, useEffect, useRef } from 'react'
import { Bell } from 'lucide-react'
import { NotificationCenterDrawer } from './NotificationCenterDrawer'
import { subscribeClientNotificationEvent } from '@/lib/events/client-event-bus'

export function NotificationBell() {
  const [unreadCount, setUnreadCount] = useState<number>(0)
  const [drawerOpen, setDrawerOpen] = useState<boolean>(false)
  const triggerButtonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    let mounted = true
    const loadState = async () => {
      try {
        const res = await fetch('/api/notifications?limit=1')
        const data = await res.json()
        if (mounted && data.success) {
          setUnreadCount(data.unreadCount || 0)
        }
      } catch (err) {
        console.warn('[NotificationBell] Error fetching notifications:', err)
      }
    }

    void loadState()

    const unsubscribe = subscribeClientNotificationEvent(() => {
      void loadState()
    })

    const interval = setInterval(() => {
      void loadState()
    }, 60000)

    return () => {
      mounted = false
      unsubscribe()
      clearInterval(interval)
    }
  }, [])

  const handleCloseDrawer = () => {
    setDrawerOpen(false)
    // Restore focus to trigger button when panel closes
    setTimeout(() => {
      triggerButtonRef.current?.focus()
    }, 50)
  }

  return (
    <>
      {/* Bell Trigger Button */}
      <button
        ref={triggerButtonRef}
        type="button"
        onClick={() => setDrawerOpen(true)}
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

      {/* Notification Center Panel (Drawer) */}
      <NotificationCenterDrawer
        isOpen={drawerOpen}
        onClose={handleCloseDrawer}
        onUnreadCountChange={(cnt) => setUnreadCount(cnt)}
      />
    </>
  )
}
