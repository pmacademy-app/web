'use client'

import React from 'react'
import Link from 'next/link'
import { Check, Clock, ExternalLink, Trophy, BookOpen, Shield, Bell } from 'lucide-react'

export interface NotificationItem {
  id: string
  userId: string
  title: string
  body: string
  category: string
  priority?: string
  isRead: boolean
  deepLink?: string
  icon?: string
  createdAt: string
}

interface NotificationItemCardProps {
  item: NotificationItem
  onMarkRead?: (id: string) => void
  onMarkUnread?: (id: string) => void
  onNavigate?: () => void
}

export function NotificationItemCard({
  item,
  onMarkRead,
  onMarkUnread,
  onNavigate,
}: NotificationItemCardProps) {
  const isHighPriority = item.priority === 'high' || item.priority === 'critical'
  const formattedTime = getRelativeTimeString(item.createdAt)

  return (
    <div
      className={`group relative p-3.5 rounded-xl border transition-all duration-150 motion-reduce:transition-none ${
        item.isRead
          ? 'bg-card border-border/70 text-muted-foreground hover:border-border'
          : 'bg-primary/5 border-primary/20 text-foreground shadow-xs hover:border-primary/40'
      }`}
    >
      <div className="flex items-start gap-3">
        {/* Category / Custom Icon */}
        <div
          className={`w-9 h-9 rounded-lg flex items-center justify-center text-lg shrink-0 ${
            item.isRead ? 'bg-secondary/60' : 'bg-primary/10'
          }`}
          aria-hidden="true"
        >
          {getCategoryIcon(item.category, item.icon)}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0 pr-6 space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h4
              className={`text-xs font-semibold truncate ${
                item.isRead ? 'text-foreground/80' : 'text-foreground font-bold'
              }`}
            >
              {item.title}
            </h4>

            {isHighPriority && (
              <span className="text-[9px] uppercase tracking-wider font-bold bg-amber-500/10 text-amber-600 px-1.5 py-0.5 rounded border border-amber-500/20">
                High Priority
              </span>
            )}
          </div>

          <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
            {item.body}
          </p>

          <div className="flex items-center justify-between text-[10px] text-muted-foreground/80 pt-1">
            <span className="flex items-center gap-1 font-mono">
              <Clock className="w-3 h-3 text-muted-foreground" />
              {formattedTime}
            </span>

            {item.deepLink && (
              <Link
                href={item.deepLink}
                onClick={onNavigate}
                className="inline-flex items-center gap-1 font-bold text-primary hover:underline focus:outline-none focus-visible:ring-1 focus-visible:ring-primary rounded px-1 py-0.5"
              >
                View
                <ExternalLink className="w-2.5 h-2.5" />
              </Link>
            )}
          </div>
        </div>

        {/* Unread indicator dot / Mark Read / Mark Unread action button */}
        <div className="absolute right-3 top-3 flex items-center gap-1">
          {!item.isRead ? (
            <button
              type="button"
              onClick={() => onMarkRead?.(item.id)}
              aria-label={`Mark notification "${item.title}" as read`}
              title="Mark as read"
              className="p-1 text-primary hover:text-primary/80 hover:bg-primary/10 rounded-full transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-primary cursor-pointer"
            >
              <span className="w-2 h-2 rounded-full bg-primary block animate-pulse" />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => onMarkUnread?.(item.id)}
              aria-label={`Mark notification "${item.title}" as unread`}
              title="Mark as unread"
              className="opacity-0 group-hover:opacity-100 focus:opacity-100 p-1 text-muted-foreground hover:text-foreground rounded transition-opacity cursor-pointer focus:outline-none focus-visible:ring-1 focus-visible:ring-primary"
            >
              <Check className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function getCategoryIcon(category?: string, customIcon?: string) {
  if (customIcon && customIcon.length > 0 && customIcon !== '🔔') {
    return <span>{customIcon}</span>
  }
  switch (category?.toLowerCase()) {
    case 'achievements':
    case 'achievement':
      return <Trophy className="w-4 h-4 text-amber-500" />
    case 'learning':
    case 'curriculum':
      return <BookOpen className="w-4 h-4 text-primary" />
    case 'security':
    case 'account':
      return <Shield className="w-4 h-4 text-blue-500" />
    default:
      return <Bell className="w-4 h-4 text-primary" />
  }
}

function getRelativeTimeString(isoDate: string): string {
  try {
    const diffMs = Date.now() - new Date(isoDate).getTime()
    const diffSecs = Math.floor(diffMs / 1000)
    if (diffSecs < 60) return 'Just now'
    const diffMins = Math.floor(diffSecs / 60)
    if (diffMins < 60) return `${diffMins}m ago`
    const diffHours = Math.floor(diffMins / 60)
    if (diffHours < 24) return `${diffHours}h ago`
    const diffDays = Math.floor(diffHours / 24)
    if (diffDays < 7) return `${diffDays}d ago`
    return new Date(isoDate).toLocaleDateString()
  } catch {
    return isoDate
  }
}
