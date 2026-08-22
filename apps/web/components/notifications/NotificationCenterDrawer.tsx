'use client'

import React, { useState, useEffect, useCallback, useRef } from 'react'
import Link from 'next/link'
import { X, Bell, RefreshCw, Layers, Settings, AlertTriangle } from 'lucide-react'
import { NotificationItemCard, type NotificationItem } from './NotificationItemCard'

interface NotificationCenterDrawerProps {
  isOpen: boolean
  onClose: () => void
  onUnreadCountChange?: (count: number) => void
  containerRef?: React.RefObject<HTMLElement | null>
}

export function NotificationCenterDrawer({
  isOpen,
  onClose,
  onUnreadCountChange,
  containerRef,
}: NotificationCenterDrawerProps) {
  const [items, setItems] = useState<NotificationItem[]>([])
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)
  const [unreadCount, setUnreadCount] = useState<number>(0)
  const [grouped, setGrouped] = useState<{
    today: NotificationItem[]
    yesterday: NotificationItem[]
    thisWeek: NotificationItem[]
    earlier: NotificationItem[]
  }>({ today: [], yesterday: [], thisWeek: [], earlier: [] })

  const closeButtonRef = useRef<HTMLButtonElement>(null)

  // Focus management, click outside, & keyboard escape
  useEffect(() => {
    if (!isOpen) return

    closeButtonRef.current?.focus()

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }

    const handlePointerDown = (e: PointerEvent) => {
      if (containerRef?.current && !containerRef.current.contains(e.target as Node)) {
        onClose()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    document.addEventListener('pointerdown', handlePointerDown)

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      document.removeEventListener('pointerdown', handlePointerDown)
    }
  }, [isOpen, onClose, containerRef])

  const fetchNotifications = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/notifications')
      const data = await res.json()
      if (data.success) {
        setItems(data.items || [])
        setUnreadCount(data.unreadCount || 0)
        onUnreadCountChange?.(data.unreadCount || 0)
        setGrouped(data.grouped || { today: [], yesterday: [], thisWeek: [], earlier: [] })
      } else {
        setError(data.error || 'Failed to fetch notifications.')
      }
    } catch (err) {
      console.error('[NotificationCenterDrawer] Error fetching notifications:', err)
      setError('Unable to load notifications. Please try again.')
    } finally {
      setLoading(false)
    }
  }, [onUnreadCountChange])

  useEffect(() => {
    let mounted = true
    if (isOpen) {
      const load = async () => {
        setLoading(true)
        setError(null)
        try {
          const res = await fetch('/api/notifications')
          const data = await res.json()
          if (mounted && data.success) {
            setItems(data.items || [])
            setUnreadCount(data.unreadCount || 0)
            onUnreadCountChange?.(data.unreadCount || 0)
            setGrouped(data.grouped || { today: [], yesterday: [], thisWeek: [], earlier: [] })
          } else if (mounted) {
            setError(data.error || 'Failed to fetch notifications.')
          }
        } catch (err) {
          console.error('[NotificationCenterDrawer] Error fetching notifications:', err)
          if (mounted) setError('Unable to load notifications. Please try again.')
        } finally {
          if (mounted) setLoading(false)
        }
      }
      void load()
    }
    return () => {
      mounted = false
    }
  }, [isOpen, onUnreadCountChange])

  // WhatsApp-style instant auto-read: Optimistic local state update + async API patch
  const handleMarkRead = async (id: string) => {
    // 1. Optimistic state mutation
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, isRead: true } : item)))
    setGrouped((prev) => {
      const updateList = (list: NotificationItem[]) =>
        list.map((item) => (item.id === id ? { ...item, isRead: true } : item))
      return {
        today: updateList(prev.today),
        yesterday: updateList(prev.yesterday),
        thisWeek: updateList(prev.thisWeek),
        earlier: updateList(prev.earlier),
      }
    })
    setUnreadCount((prev) => {
      const next = Math.max(0, prev - 1)
      onUnreadCountChange?.(next)
      return next
    })

    // 2. Persist read state in DB with rollback on failure
    try {
      const res = await fetch('/api/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'mark_read', notificationId: id }),
      })
      if (!res.ok) {
        console.warn('[NotificationCenterDrawer] Server failed to persist read state, resyncing')
        void fetchNotifications()
      }
    } catch (err) {
      console.error('[NotificationCenterDrawer] Error marking read in DB:', err)
      void fetchNotifications()
    }
  }

  if (!isOpen) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Notifications"
      className="fixed top-16 left-4 right-4 max-w-[calc(100vw-32px)] max-h-[80vh] sm:absolute sm:top-full sm:left-auto sm:right-0 sm:mt-2.5 sm:w-96 sm:max-w-sm sm:max-h-[85vh] z-50 bg-background border border-border rounded-2xl shadow-2xl flex flex-col focus:outline-none overflow-hidden animate-in fade-in zoom-in-95 duration-150 motion-reduce:animate-none"
    >
      {/* Clean Header */}
      <div className="p-4 border-b border-border flex items-center justify-between bg-card/50">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center font-bold text-sm">
            <Bell className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-foreground">Notifications</h3>
            <p className="text-[11px] text-muted-foreground">
              {unreadCount > 0
                ? `${unreadCount} unread update${unreadCount === 1 ? '' : 's'}`
                : 'All caught up'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <Link
            href="/settings?tab=notifications"
            onClick={onClose}
            aria-label="Notification Preferences"
            title="Notification Preferences"
            className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-secondary/60 rounded-lg transition-colors cursor-pointer focus:outline-none focus-visible:ring-1 focus-visible:ring-primary"
          >
            <Settings className="w-4 h-4" />
          </Link>

          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            aria-label="Close notification panel"
            className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-secondary/60 rounded-lg transition-colors cursor-pointer focus:outline-none focus-visible:ring-1 focus-visible:ring-primary"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Unified Notification List Panel */}
      <div
        id="notification-list-panel"
        role="region"
        aria-label="Notification activity feed"
        className="flex-1 overflow-y-auto p-4 space-y-5"
      >
        {loading ? (
          <div className="py-16 text-center text-muted-foreground flex flex-col items-center justify-center gap-2">
            <RefreshCw className="w-5 h-5 animate-spin text-primary" />
            <span className="text-xs font-medium">Loading updates...</span>
          </div>
        ) : error ? (
          <div className="py-12 text-center text-muted-foreground flex flex-col items-center justify-center gap-3">
            <div className="w-10 h-10 rounded-full bg-destructive/10 text-destructive flex items-center justify-center">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <p className="text-xs text-foreground font-medium max-w-xs">{error}</p>
            <button
              type="button"
              onClick={() => void fetchNotifications()}
              className="px-3 py-1.5 rounded-lg bg-primary/10 border border-primary/20 text-primary font-bold text-xs hover:bg-primary/20 transition-colors cursor-pointer"
            >
              Retry
            </button>
          </div>
        ) : items.length === 0 ? (
          <div className="py-16 text-center text-muted-foreground flex flex-col items-center justify-center gap-3">
            <div className="w-12 h-12 rounded-full bg-secondary/80 flex items-center justify-center text-foreground/50">
              <Layers className="w-6 h-6" />
            </div>
            <div>
              <h4 className="text-sm font-semibold text-foreground mb-1">No notifications yet</h4>
              <p className="text-xs max-w-xs text-muted-foreground leading-relaxed">
                You&apos;re completely up to date! Check back as you complete lessons, maintain streaks, and earn achievements.
              </p>
            </div>
          </div>
        ) : (
          <>
            {/* Today */}
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
                      onNavigate={onClose}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Yesterday */}
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
                      onNavigate={onClose}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* This Week */}
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
                      onNavigate={onClose}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Earlier */}
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
                      onNavigate={onClose}
                    />
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Footer Bar */}
      <div className="p-3 border-t border-border bg-card/40 flex items-center justify-between text-xs">
        <Link
          href="/settings?tab=notifications"
          onClick={onClose}
          className="text-xs font-bold text-primary hover:underline inline-flex items-center gap-1.5"
        >
          <Settings className="w-3.5 h-3.5" />
          Settings
        </Link>

        <button
          type="button"
          onClick={() => void fetchNotifications()}
          aria-label="Refresh notifications"
          title="Refresh notifications"
          className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-secondary/60 rounded-lg transition-colors cursor-pointer"
        >
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  )
}
