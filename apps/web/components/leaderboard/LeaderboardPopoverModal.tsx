'use client'

import React, { useEffect, useRef } from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

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
  const modalRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  if (!isOpen) return null

  return (
    <>
      {/* Click-outside backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/40 animate-in fade-in duration-150"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Floating Popover Modal */}
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn(
          'fixed top-20 left-4 right-4 sm:absolute sm:top-full sm:left-auto sm:right-0 sm:mt-2.5',
          'w-auto sm:w-[480px] max-h-[82vh] sm:max-h-[75vh]',
          'z-50 bg-card border border-border rounded-2xl shadow-2xl flex flex-col overflow-hidden',
          'animate-in fade-in zoom-in-95 duration-150'
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
                <h3 className="text-sm font-bold font-serif text-foreground">{title}</h3>
                {badgeText && (
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-muted text-muted-foreground font-semibold">
                    {badgeText}
                  </span>
                )}
              </div>
              {subtitle && <p className="text-[11px] text-muted-foreground">{subtitle}</p>}
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
      </div>
    </>
  )
}
