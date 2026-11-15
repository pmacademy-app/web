'use client'

import React from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'

interface LeaderboardPopoverModalProps {
  isOpen: boolean
  onClose: () => void
  title: string
  subtitle?: string
  icon: React.ElementType
  iconClassName?: string
  badgeText?: string
  children: React.ReactNode
}

export function LeaderboardPopoverModal({
  isOpen,
  onClose,
  title,
  subtitle,
  icon: Icon,
  iconClassName,
  badgeText,
  children,
}: LeaderboardPopoverModalProps) {
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        showCloseButton={false}
        className={cn(
          'w-[calc(100%-2rem)] sm:w-[480px] max-h-[82vh] sm:max-h-[75vh]',
          'bg-card border border-border rounded-2xl shadow-2xl flex flex-col overflow-hidden p-0 gap-0'
        )}
      >
        {/* Modal Header */}
        <div className="p-4 border-b border-border flex items-center justify-between bg-card">
          <div className="flex items-center gap-3">
            <div
              className={cn(
                'w-9 h-9 rounded-xl flex items-center justify-center font-bold text-sm shadow-xs',
                iconClassName || 'bg-primary/10 text-primary'
              )}
            >
              <Icon className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <DialogTitle className="text-sm font-bold font-serif text-foreground">{title}</DialogTitle>
                {badgeText && (
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-muted text-muted-foreground font-semibold">
                    {badgeText}
                  </span>
                )}
              </div>
              {subtitle && <DialogDescription className="text-[11px] text-muted-foreground">{subtitle}</DialogDescription>}
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label={`Close ${title}`}
            className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-secondary/70 rounded-lg transition-colors cursor-pointer focus:outline-none focus-visible:ring-1 focus-visible:ring-primary"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {children}
        </div>
      </DialogContent>
    </Dialog>
  )
}
