'use client'

import React, { useState, useEffect, useRef, useCallback } from 'react'
import { Bell, CheckCheck, ExternalLink } from 'lucide-react'
import { NotificationCenterDrawer } from './NotificationCenterDrawer'
import { NotificationItemCard, type NotificationItem } from './NotificationItemCard'

export function NotificationBell() {
  const [unreadCount, setUnreadCount] = useState<number>(0)
  const [items, setItems] = useState<NotificationItem[]>([])
  const [popoverOpen, setPopoverOpen] = useState<boolean>(false)
  const [drawerOpen, setDrawerOpen] = useState<boolean>(false)
  const popoverRef = useRef<HTMLDivElement>(null)

  const fetchNotificationState = useCallback(async () => {
    try {
      const res = await fetch('/api/notifications?limit=5')
      const data = await res.json()
      if (data.success) {
        setUnreadCount(data.unreadCount || 0)
        setItems(data.items || [])
      }
    } catch (err) {
      console.warn('[NotificationBell] Error fetching notifications:', err)
    }
  }, [])

  useEffect(() => {
    let mounted = true
    const loadState = async () => {
      try {
        const res = await fetch('/api/notifications?limit=5')
        const data = await res.json()
        if (mounted && data.success) {
          setUnreadCount(data.unreadCount || 0)
          setItems(data.items || [])
        }
      } catch (err) {
        console.warn('[NotificationBell] Error fetching notifications:', err)
      }
    }

    void loadState()

    const interval = setInterval(() => {
      void loadState()
    }, 60000)

    return () => {
      mounted = false
      clearInterval(interval)
    }
  }, [])

  // Close popover on outside click
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setPopoverOpen(false)
      }
    }
    document.addEventListener('mousedown', handleOutsideClick)
    return () => document.removeEventListener('mousedown', handleOutsideClick)
  }, [])

  const handleMarkAllRead = async () => {
    try {
      await fetch('/api/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'mark_all_read' }),
      })
      void fetchNotificationState()
    } catch (err) {
      console.error('[NotificationBell] Error marking all read:', err)
    }
  }

  return (
    <div className="relative" ref={popoverRef}>
      {/* Bell Trigger Button */}
      <button
        type="button"
        onClick={() => setPopoverOpen((prev) => !prev)}
        aria-label={`Notifications (${unreadCount} unread)`}
        aria-expanded={popoverOpen}
        aria-haspopup="menu"
        className="relative p-2 rounded-full border border-border bg-card hover:bg-secondary/40 text-foreground transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 flex items-center justify-center"
      >
        <Bell className="w-4 h-4 text-muted-foreground group-hover:text-foreground" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 min-w-4 h-4 px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-extrabold flex items-center justify-center border-2 border-background animate-in zoom-in duration-150">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Popover Preview */}
      {popoverOpen && (
        <div
          className="absolute right-0 mt-2 w-80 sm:w-96 rounded-xl border border-border bg-card shadow-xl p-3 z-30 focus:outline-none animate-in fade-in duration-100"
          role="menu"
          aria-label="Quick Notification Preview"
        >
          <div className="flex items-center justify-between border-b border-border pb-2.5 mb-2 px-1">
            <div className="flex items-center gap-1.5">
              <span className="font-bold text-xs text-foreground">Notifications</span>
              {unreadCount > 0 && (
                <span className="text-[10px] bg-primary/10 text-primary font-bold px-1.5 py-0.5 rounded-full">
                  {unreadCount} new
                </span>
              )}
            </div>

            {unreadCount > 0 && (
              <button
                type="button"
                onClick={handleMarkAllRead}
                className="text-[11px] font-semibold text-primary hover:underline flex items-center gap-1 cursor-pointer focus:outline-none"
              >
                <CheckCheck className="w-3 h-3" />
                Mark all read
              </button>
            )}
          </div>

          <div className="space-y-2 max-h-72 overflow-y-auto pr-0.5">
            {items.length === 0 ? (
              <div className="py-8 text-center text-xs text-muted-foreground">
                No notifications right now.
              </div>
            ) : (
              items.slice(0, 4).map((item) => (
                <NotificationItemCard
                  key={item.id}
                  item={item}
                  onNavigate={() => setPopoverOpen(false)}
                />
              ))
            )}
          </div>

          <div className="pt-2.5 mt-2 border-t border-border text-center">
            <button
              type="button"
              onClick={() => {
                setPopoverOpen(false)
                setDrawerOpen(true)
              }}
              className="w-full py-1.5 text-xs font-bold text-primary hover:bg-primary/10 rounded-lg transition-colors flex items-center justify-center gap-1 cursor-pointer focus:outline-none"
            >
              View Notification Center
              <ExternalLink className="w-3 h-3" />
            </button>
          </div>
        </div>
      )}

      {/* Full Notification Center Drawer */}
      <NotificationCenterDrawer
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onUnreadCountChange={(cnt) => setUnreadCount(cnt)}
      />
    </div>
  )
}
