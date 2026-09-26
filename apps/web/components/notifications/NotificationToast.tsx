'use client'

import React, { useState, useEffect } from 'react'
import { subscribeClientNotificationEvent, type ClientNotificationEventDetail } from '@/lib/events/client-event-bus'
import { Sparkles, Award, CheckCircle2, AlertCircle, X } from 'lucide-react'

export function NotificationToast() {
  const [toast, setToast] = useState<ClientNotificationEventDetail | null>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const unsubscribe = subscribeClientNotificationEvent((detail) => {
      setToast(detail)
      setVisible(true)
    })

    return () => unsubscribe()
  }, [])

  useEffect(() => {
    if (!visible) return
    const timer = setTimeout(() => {
      setVisible(false)
    }, 4500)
    return () => clearTimeout(timer)
  }, [visible, toast])

  if (!toast || !visible) return null

  const isError = toast.variant === 'error'
  const isSuccess = toast.variant === 'success'

  const borderClass = isError
    ? 'border-destructive/40 shadow-destructive/10'
    : isSuccess
    ? 'border-emerald-500/40 shadow-emerald-500/10'
    : 'border-primary/30 shadow-primary/10'

  const iconBgClass = isError
    ? 'bg-destructive/10 text-destructive'
    : isSuccess
    ? 'bg-emerald-500/10 text-emerald-500'
    : 'bg-primary/10 text-primary'

  return (
    <div
      className={`fixed bottom-6 right-6 z-50 max-w-sm w-full bg-card border rounded-2xl shadow-2xl p-4 flex items-start gap-3 animate-in slide-in-from-bottom duration-300 motion-reduce:animate-none ${borderClass}`}
      role={isError ? 'alert' : 'status'}
      aria-live={isError ? 'assertive' : 'polite'}
    >
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${iconBgClass}`}>
        {isError ? (
          <AlertCircle className="w-5 h-5 text-destructive" />
        ) : toast.badgeName ? (
          <Award className="w-5 h-5 text-amber-500" />
        ) : toast.xpEarned ? (
          <Sparkles className="w-5 h-5 text-primary animate-pulse" />
        ) : (
          <CheckCircle2 className="w-5 h-5 text-emerald-500" />
        )}
      </div>

      <div className="flex-1 space-y-0.5">
        <h4 className="text-xs font-bold text-foreground flex items-center justify-between">
          <span>{toast.title}</span>
          {toast.xpEarned && (
            <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.5 rounded-md">
              +{toast.xpEarned} XP
            </span>
          )}
        </h4>
        <p className="text-xs text-muted-foreground leading-snug">{toast.body}</p>
      </div>

      <button
        type="button"
        onClick={() => setVisible(false)}
        aria-label="Dismiss toast"
        className="p-1 text-muted-foreground hover:text-foreground rounded-lg transition-colors cursor-pointer"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  )
}
