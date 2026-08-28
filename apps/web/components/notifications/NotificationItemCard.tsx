'use client'

import React from 'react'
import Link from 'next/link'
import { Clock, ExternalLink, Trophy, BookOpen, Shield, Bell, Check } from 'lucide-react'

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
  onNavigate,
}: NotificationItemCardProps) {
  const isHighPriority = item.priority === 'high' || item.priority === 'critical'
  const formattedTime = getRelativeTimeString(item.createdAt)

  const handleInteraction = () => {
    if (!item.isRead && onMarkRead) {
      onMarkRead(item.id)
    }
  }

  const cardInner = (
    <div className="flex items-start gap-3">
      {/* Category / Custom Icon */}
      <div
        className={`w-8 h-8 rounded-lg flex items-center justify-center text-base shrink-0 ${
          item.isRead ? 'bg-secondary/60' : 'bg-primary/15 text-primary'
        }`}
        aria-hidden="true"
      >
        {getCategoryIcon(item.category, item.icon)}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex items-center justify-between gap-2">
          <h4
            className={`text-xs font-semibold truncate ${
              item.isRead ? 'text-foreground/80 font-medium' : 'text-foreground font-bold'
            }`}
          >
            {item.title}
          </h4>

          <span className="flex items-center gap-1 text-[10px] font-mono text-muted-foreground shrink-0">
            <Clock className="w-2.5 h-2.5" />
            {formattedTime}
          </span>
        </div>

        <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
          {item.body}
        </p>

        <div className="flex items-center justify-between text-[10px] pt-1">
          {isHighPriority && (
            <span className="text-[9px] uppercase tracking-wider font-bold bg-amber-500/10 text-amber-600 dark:text-amber-400 px-1.5 py-0.2 rounded border border-amber-500/20">
              Priority
            </span>
          )}

          {item.deepLink && (
            <span className="inline-flex items-center gap-1 font-bold text-primary hover:underline ml-auto">
              View <ExternalLink className="w-2.5 h-2.5" />
            </span>
          )}
        </div>
      </div>

      {/* Unread indicator dot & quick mark-as-read action */}
      {!item.isRead && (
        <div className="flex items-center gap-1 shrink-0 mt-0.5">
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              handleInteraction()
            }}
            title="Mark as read"
            aria-label="Mark notification as read"
            className="opacity-0 group-hover:opacity-100 focus:opacity-100 p-1 hover:bg-primary/20 text-muted-foreground hover:text-primary rounded-full transition-opacity cursor-pointer"
          >
            <Check className="w-3 h-3" />
          </button>
          <span
            className="w-2 h-2 rounded-full bg-primary animate-pulse"
            title="Unread"
            aria-label="Unread notification"
          />
        </div>
      )}
    </div>
  )

  const cardClassName = `group relative p-3.5 rounded-xl border transition-all duration-150 motion-reduce:transition-none ${
    item.isRead
      ? 'bg-card/70 border-border/60 text-muted-foreground hover:bg-card hover:border-border'
      : 'bg-primary/5 border-primary/20 text-foreground shadow-xs hover:border-primary/40 hover:bg-primary/10'
  }`

  if (item.deepLink) {
    return (
      <Link
        href={item.deepLink}
        onClick={() => {
          handleInteraction()
          onNavigate?.()
        }}
        className={`block w-full focus:outline-none focus-visible:ring-2 focus-visible:ring-primary ${cardClassName}`}
      >
        {cardInner}
      </Link>
    )
  }

  return (
    <div
      onClick={handleInteraction}
      className={`block w-full cursor-pointer ${cardClassName}`}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          handleInteraction()
        }
      }}
    >
      {cardInner}
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
