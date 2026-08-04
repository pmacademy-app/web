'use client'

import { useEffect } from 'react'
import type { SRSRating } from '@/lib/srs'

interface QualityOption {
  rating: SRSRating
  label: string
  shortcut: string
  color: string
}

const QUALITY_OPTIONS: QualityOption[] = [
  { rating: 0, label: 'Blackout', shortcut: '0', color: 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30 hover:bg-rose-500/20' },
  { rating: 1, label: 'Incorrect', shortcut: '1', color: 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30 hover:bg-rose-500/20' },
  { rating: 2, label: 'Difficult', shortcut: '2', color: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30 hover:bg-amber-500/20' },
  { rating: 3, label: 'Pass', shortcut: '3', color: 'bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/30 hover:bg-sky-500/20' },
  { rating: 4, label: 'Good', shortcut: '4', color: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30 hover:bg-blue-500/20' },
  { rating: 5, label: 'Perfect', shortcut: '5', color: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20' },
]

interface QualitySelectorProps {
  onSelect: (rating: SRSRating) => void
  disabled?: boolean
}

export function QualitySelector({ onSelect, disabled = false }: QualitySelectorProps) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (disabled) return
      if (['0', '1', '2', '3', '4', '5'].includes(e.key)) {
        e.preventDefault()
        onSelect(parseInt(e.key, 10) as SRSRating)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onSelect, disabled])

  return (
    <div className="w-full max-w-xl mx-auto space-y-3">
      <div className="flex items-center justify-between text-xs text-muted-foreground font-medium px-1">
        <span>Rate recall difficulty:</span>
        <span className="font-mono text-[11px]">Use keys 0–5 or click</span>
      </div>

      <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
        {QUALITY_OPTIONS.map((opt) => (
          <button
            key={opt.rating}
            type="button"
            disabled={disabled}
            onClick={() => onSelect(opt.rating)}
            className={`flex flex-col items-center justify-center p-3 rounded-xl border text-xs font-semibold transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed active:scale-95 focus:outline-none focus:ring-2 focus:ring-primary ${opt.color}`}
          >
            <span className="text-base font-extrabold font-mono">{opt.rating}</span>
            <span className="text-[11px] mt-0.5">{opt.label}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
