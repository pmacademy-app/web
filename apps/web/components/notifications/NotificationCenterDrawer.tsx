'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { X, CheckCheck, Bell, RefreshCw, Layers } from 'lucide-react'
import { NotificationItemCard, type NotificationItem } from './NotificationItemCard'

interface NotificationCenterDrawerProps {
  isOpen: boolean
  onClose: () => void
  onUnreadCountChange?: (count: number) => void
}

type FilterCategory = 'all' | 'unread' | 'achievements' | 'learning' | 'security'

export function NotificationCenterDrawer({
  isOpen,
  onClose,
  onUnreadCountChange,
}: NotificationCenterDrawerProps) {
  const [items, setItems] = useState<NotificationItem[]>([])
  const [activeCategory, setActiveCategory] = useState<FilterCategory>('all')
  const [loading, setLoading] = useState<boolean>(true)
  const [unreadCount, setUnreadCount] = useState<number>(0)
  const [grouped, setGrouped] = useState<{
    today: NotificationItem[]
    yesterday: NotificationItem[]
    thisWeek: NotificationItem[]
    earlier: NotificationItem[]
  }>({ today: [], yesterday: [], thisWeek: [], earlier: [] })

  const fetchNotifications = useCallback(async () => {
    setLoading(true)
    try {
      const url =
        activeCategory === 'unread'
          ? '/api/notifications?unreadOnly=true'
          : activeCategory === 'all'
          ? '/api/notifications'
          : `/api/notifications?category=${activeCategory}`

      const res = await fetch(url)
      const data = await res.json()
      if (data.success) {
        setItems(data.items || [])
        setUnreadCount(data.unreadCount || 0)
        onUnreadCountChange?.(data.unreadCount || 0)
        setGrouped(data.grouped || { today: [], yesterday: [], thisWeek: [], earlier: [] })
      }
    } catch (err) {
      console.error('[NotificationCenterDrawer] Error fetching notifications:', err)
    } finally {
      setLoading(false)
    }
  }, [activeCategory, onUnreadCountChange])

  useEffect(() => {
    let mounted = true
    if (isOpen) {
      const load = async () => {
        setLoading(true)
        try {
          const url =
            activeCategory === 'unread'
              ? '/api/notifications?unreadOnly=true'
              : activeCategory === 'all'
              ? '/api/notifications'
              : `/api/notifications?category=${activeCategory}`

          const res = await fetch(url)
          const data = await res.json()
          if (mounted && data.success) {
            setItems(data.items || [])
            setUnreadCount(data.unreadCount || 0)
            onUnreadCountChange?.(data.unreadCount || 0)
            setGrouped(data.grouped || { today: [], yesterday: [], thisWeek: [], earlier: [] })
          }
        } catch (err) {
          console.error('[NotificationCenterDrawer] Error fetching notifications:', err)
        } finally {
          if (mounted) setLoading(false)
        }
      }
      void load()
    }
    return () => {
      mounted = false
    }
  }, [isOpen, activeCategory, onUnreadCountChange])

  // ESC key handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  const handleMarkRead = async (id: string) => {
    try {
      await fetch('/api/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'mark_read', notificationId: id }),
      })
      void fetchNotifications()
    } catch (err) {
      console.error('[NotificationCenterDrawer] Error marking read:', err)
    }
  }

  const handleMarkUnread = async (id: string) => {
    try {
      await fetch('/api/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'mark_unread', notificationId: id }),
      })
      void fetchNotifications()
    } catch (err) {
      console.error('[NotificationCenterDrawer] Error marking unread:', err)
    }
  }

  const handleMarkAllRead = async () => {
    try {
      await fetch('/api/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'mark_all_read' }),
      })
      void fetchNotifications()
    } catch (err) {
      console.error('[NotificationCenterDrawer] Error marking all read:', err)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-black/40 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="absolute inset-y-0 right-0 max-w-full flex pl-10">
        <div
          className="w-screen max-w-md bg-background border-l border-border shadow-2xl flex flex-col focus:outline-none"
          role="dialog"
          aria-modal="true"
          aria-label="In-App Notification Center"
        >
          {/* Header */}
          <div className="p-4 border-b border-border flex items-center justify-between bg-card/50">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center font-bold text-sm">
                <Bell className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-foreground">Notification Center</h3>
                <p className="text-[11px] text-muted-foreground">
                  {unreadCount} unread update{unreadCount === 1 ? '' : 's'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1">
              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={handleMarkAllRead}
                  className="px-2.5 py-1 text-xs font-semibold text-primary hover:bg-primary/10 rounded-lg transition-colors flex items-center gap-1 cursor-pointer focus:outline-none focus-visible:ring-1 focus-visible:ring-primary"
                >
                  <CheckCheck className="w-3.5 h-3.5" />
                  Mark All Read
                </button>
              )}
              <button
                type="button"
                onClick={onClose}
                aria-label="Close notification drawer"
                className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-secondary/60 rounded-lg transition-colors cursor-pointer focus:outline-none focus-visible:ring-1 focus-visible:ring-primary"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Filter Bar */}
          <div className="px-4 py-2 border-b border-border bg-card/20 flex items-center gap-1.5 overflow-x-auto text-xs scrollbar-none">
            {(
              [
                { id: 'all', label: 'All' },
                { id: 'unread', label: 'Unread' },
                { id: 'achievements', label: 'Achievements' },
                { id: 'learning', label: 'Learning' },
                { id: 'security', label: 'Security' },
              ] as const
            ).map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => setActiveCategory(cat.id)}
                className={`px-2.5 py-1 rounded-full text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer ${
                  activeCategory === cat.id
                    ? 'bg-primary text-primary-foreground shadow-xs'
                    : 'bg-secondary/60 text-muted-foreground hover:text-foreground hover:bg-secondary'
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>

          {/* Notification List Container */}
          <div className="flex-1 overflow-y-auto p-4 space-y-5">
            {loading ? (
              <div className="py-12 text-center text-muted-foreground flex flex-col items-center gap-2">
                <RefreshCw className="w-5 h-5 animate-spin text-primary" />
                <span className="text-xs">Loading notifications...</span>
              </div>
            ) : items.length === 0 ? (
              <div className="py-16 text-center text-muted-foreground flex flex-col items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-secondary/80 flex items-center justify-center text-foreground/50">
                  <Layers className="w-6 h-6" />
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-foreground mb-1">No notifications</h4>
                  <p className="text-xs max-w-xs text-muted-foreground">
                    You&apos;re all caught up! Check back after completing lessons or earning new achievements.
                  </p>
                </div>
              </div>
            ) : (
              <>
                {/* Date Grouped View */}
                {grouped.today.length > 0 && (
                  <div className="space-y-2">
                    <h5 className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider px-1">
                      Today
                    </h5>
                    <div className="space-y-2">
                      {grouped.today.map((item) => (
                        <NotificationItemCard
                          key={item.id}
                          item={item}
                          onMarkRead={handleMarkRead}
                          onMarkUnread={handleMarkUnread}
                          onNavigate={onClose}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {grouped.yesterday.length > 0 && (
                  <div className="space-y-2">
                    <h5 className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider px-1">
                      Yesterday
                    </h5>
                    <div className="space-y-2">
                      {grouped.yesterday.map((item) => (
                        <NotificationItemCard
                          key={item.id}
                          item={item}
                          onMarkRead={handleMarkRead}
                          onMarkUnread={handleMarkUnread}
                          onNavigate={onClose}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {grouped.thisWeek.length > 0 && (
                  <div className="space-y-2">
                    <h5 className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider px-1">
                      This Week
                    </h5>
                    <div className="space-y-2">
                      {grouped.thisWeek.map((item) => (
                        <NotificationItemCard
                          key={item.id}
                          item={item}
                          onMarkRead={handleMarkRead}
                          onMarkUnread={handleMarkUnread}
                          onNavigate={onClose}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {grouped.earlier.length > 0 && (
                  <div className="space-y-2">
                    <h5 className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider px-1">
                      Earlier
                    </h5>
                    <div className="space-y-2">
                      {grouped.earlier.map((item) => (
                        <NotificationItemCard
                          key={item.id}
                          item={item}
                          onMarkRead={handleMarkRead}
                          onMarkUnread={handleMarkUnread}
                          onNavigate={onClose}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
