'use client'

import React, { useState, useEffect } from 'react'
import Link from 'next/link'
import { Bell, ArrowRight } from 'lucide-react'
import { NotificationItemCard, type NotificationItem } from './NotificationItemCard'

export function DashboardNotificationsWidget() {
  const [items, setItems] = useState<NotificationItem[]>([])
  const [loading, setLoading] = useState<boolean>(true)

  useEffect(() => {
    const fetchRecent = async () => {
      try {
        const res = await fetch('/api/notifications?limit=3')
        const data = await res.json()
        if (data.success) {
          setItems(data.items || [])
        }
      } catch (err) {
        console.warn('[DashboardNotificationsWidget] Error loading widget items:', err)
      } finally {
        setLoading(false)
      }
    }
    fetchRecent()
  }, [])

  if (loading) {
    return (
      <div className="p-4 rounded-2xl border border-border bg-card/60 space-y-3">
        <div className="h-4 bg-secondary/80 rounded w-1/3 animate-pulse" />
        <div className="h-16 bg-secondary/40 rounded-xl animate-pulse" />
      </div>
    )
  }

  if (items.length === 0) {
    return null
  }

  const handleMarkRead = async (id: string) => {
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, isRead: true } : item)))
    try {
      await fetch('/api/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'mark_read', notificationId: id }),
      })
    } catch (err) {
      console.warn('[DashboardNotificationsWidget] Error marking read in DB:', err)
    }
  }

  return (
    <div className="p-4 rounded-2xl border border-border bg-card shadow-xs space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
            <Bell className="w-3.5 h-3.5" />
          </div>
          <h3 className="text-xs font-bold text-foreground">Recent Updates</h3>
        </div>

        <Link
          href="/settings?tab=notifications"
          className="text-[11px] font-semibold text-primary hover:underline flex items-center gap-1"
        >
          Notification Settings
          <ArrowRight className="w-3 h-3" />
        </Link>
      </div>

      <div className="space-y-2">
        {items.map((item) => (
          <NotificationItemCard
            key={item.id}
            item={item}
            onMarkRead={handleMarkRead}
          />
        ))}
      </div>
    </div>
  )
}
