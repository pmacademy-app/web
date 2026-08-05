'use client'

import React, { useState } from 'react'
import { Sparkles, X } from 'lucide-react'
import type { BadgeDefinition } from '@/config/badges'

interface BadgeNotificationProps {
  badge: BadgeDefinition
  onDismiss?: () => void
}

export function BadgeNotification({ badge, onDismiss }: BadgeNotificationProps) {
  const [visible, setVisible] = useState<boolean>(true)

  if (!visible) return null

  const handleDismiss = () => {
    setVisible(false)
    if (onDismiss) onDismiss()
  }

  return (
    <div className="fixed bottom-5 right-5 z-50 max-w-sm rounded-xl border border-amber-500/30 bg-card p-4 shadow-lg animate-in slide-in-from-bottom-5 duration-300 flex items-start gap-3">
      <div className="p-2.5 rounded-lg bg-amber-500/10 text-amber-500 shrink-0">
        <Sparkles className="w-5 h-5 animate-pulse" />
      </div>

      <div className="space-y-0.5 min-w-0 flex-1">
        <span className="text-[10px] uppercase font-bold tracking-wider text-amber-500 block">
          New Badge Unlocked!
        </span>
        <h4 className="text-sm font-bold font-serif text-foreground truncate">{badge.name}</h4>
        <p className="text-xs text-muted-foreground leading-snug">{badge.description}</p>
      </div>

      <button
        type="button"
        onClick={handleDismiss}
        className="text-muted-foreground hover:text-foreground p-1 rounded-md"
        aria-label="Dismiss notification"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  )
}
