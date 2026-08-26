'use client'

import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { Info, AlertTriangle, ShieldAlert, CheckCircle2, X, ExternalLink } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { SystemAnnouncementItem } from '@/lib/admin/announcements-service'

interface SystemAnnouncementBannerProps {
  initialAnnouncements?: SystemAnnouncementItem[]
  userId?: string | null
  cohortId?: string | null
}

const TYPE_STYLES = {
  info: {
    bg: 'bg-gradient-to-r from-blue-950/80 via-indigo-950/80 to-blue-950/80 border-blue-500/30 text-blue-100',
    icon: Info,
    iconColor: 'text-blue-400',
    badge: 'bg-blue-500/20 text-blue-300 border-blue-500/40',
  },
  warning: {
    bg: 'bg-gradient-to-r from-amber-950/80 via-orange-950/80 to-amber-950/80 border-amber-500/30 text-amber-100',
    icon: AlertTriangle,
    iconColor: 'text-amber-400',
    badge: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
  },
  critical: {
    bg: 'bg-gradient-to-r from-rose-950/90 via-red-950/90 to-rose-950/90 border-red-500/40 text-red-100',
    icon: ShieldAlert,
    iconColor: 'text-red-400',
    badge: 'bg-red-500/20 text-red-300 border-red-500/40',
  },
  success: {
    bg: 'bg-gradient-to-r from-emerald-950/80 via-teal-950/80 to-emerald-950/80 border-emerald-500/30 text-emerald-100',
    icon: CheckCircle2,
    iconColor: 'text-emerald-400',
    badge: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
  },
}

export function SystemAnnouncementBanner({
  initialAnnouncements = [],
  userId,
  cohortId,
}: SystemAnnouncementBannerProps) {
  const [announcements, setAnnouncements] = useState<SystemAnnouncementItem[]>(initialAnnouncements)
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(() => {
    if (typeof window === 'undefined') return new Set()
    try {
      const stored = localStorage.getItem('prodily_dismissed_announcements')
      return stored ? new Set(JSON.parse(stored)) : new Set()
    } catch {
      return new Set()
    }
  })

  useEffect(() => {
    if (initialAnnouncements.length > 0) return

    let isMounted = true
    const fetchAnnouncements = async () => {
      try {
        const params = new URLSearchParams()
        if (userId) params.set('userId', userId)
        if (cohortId) params.set('cohortId', cohortId)

        const res = await fetch(`/api/announcements/active?${params.toString()}`)
        const json = await res.json()
        if (isMounted && json.success && Array.isArray(json.announcements)) {
          setAnnouncements(json.announcements)
        }
      } catch (err) {
        console.warn('[SystemAnnouncementBanner] Failed to fetch announcements:', err)
      }
    }

    fetchAnnouncements()
    return () => {
      isMounted = false
    }
  }, [userId, cohortId, initialAnnouncements.length])

  const handleDismiss = async (id: string) => {
    const nextDismissed = new Set(dismissedIds)
    nextDismissed.add(id)
    setDismissedIds(nextDismissed)

    try {
      localStorage.setItem('prodily_dismissed_announcements', JSON.stringify(Array.from(nextDismissed)))
      if (userId) {
        await fetch(`/api/announcements/${id}/dismiss`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId }),
        })
      }
    } catch (err) {
      console.warn('[SystemAnnouncementBanner] Dismiss sync error:', err)
    }
  }

  const activeVisible = announcements.filter((a) => !dismissedIds.has(a.id))
  if (activeVisible.length === 0) return null

  return (
    <div className="w-full space-y-2 z-40">
      {activeVisible.map((announcement) => {
        const style = TYPE_STYLES[announcement.type] || TYPE_STYLES.info
        const Icon = style.icon

        return (
          <div
            key={announcement.id}
            role="alert"
            className={cn(
              'relative w-full border-b py-2.5 px-4 sm:px-6 transition-all backdrop-blur-md shadow-sm',
              style.bg
            )}
          >
            <div className="max-w-7xl mx-auto flex items-start sm:items-center justify-between gap-3 sm:gap-4">
              <div className="flex items-start sm:items-center gap-2.5 sm:gap-3 min-w-0 flex-1">
                <Icon className={cn('w-4 h-4 shrink-0 mt-0.5 sm:mt-0', style.iconColor)} />
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 min-w-0 text-xs leading-relaxed">
                  <span className="font-bold tracking-tight">{announcement.title}</span>
                  <span className="opacity-90">{announcement.content}</span>
                  {announcement.linkUrl && (
                    <Link
                      href={announcement.linkUrl}
                      className="inline-flex items-center gap-1 font-semibold underline underline-offset-2 hover:opacity-80 transition-opacity ml-1"
                    >
                      {announcement.linkText || 'Learn more'}
                      <ExternalLink className="w-3 h-3" />
                    </Link>
                  )}
                </div>
              </div>

              {announcement.dismissible && (
                <button
                  type="button"
                  onClick={() => handleDismiss(announcement.id)}
                  aria-label="Dismiss announcement"
                  className="p-1.5 -mr-1 rounded-md hover:bg-white/15 text-white/75 hover:text-white transition-colors shrink-0 cursor-pointer focus:outline-none focus:ring-2 focus:ring-white/40"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
