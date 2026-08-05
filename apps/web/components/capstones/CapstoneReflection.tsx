'use client'

import React from 'react'
import { MessageSquare, Globe, Lock, Check } from 'lucide-react'

interface CapstoneReflectionProps {
  content: string
  isPublic: boolean
  onChangeContent: (val: string) => void
  onChangeIsPublic: (val: boolean) => void
  isLocked?: boolean
}

export function CapstoneReflection({
  content,
  isPublic,
  onChangeContent,
  onChangeIsPublic,
  isLocked = false,
}: CapstoneReflectionProps) {
  return (
    <div className="rounded-xl border border-border bg-card/60 p-5 space-y-4 transition-all">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-lg bg-primary/10 text-primary">
            <MessageSquare className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold font-serif text-foreground">
              Personal Reflection & Portfolio Note
            </h3>
            <p className="text-xs text-muted-foreground">
              Reflect on what you learned during this capstone assignment.
            </p>
          </div>
        </div>

        {/* Public Toggle */}
        <div className="flex items-center gap-2">
          <label
            htmlFor="capstone-reflection-public"
            className="flex items-center gap-2 text-xs font-medium cursor-pointer select-none text-muted-foreground hover:text-foreground"
          >
            {isPublic ? (
              <Globe className="w-3.5 h-3.5 text-emerald-500" />
            ) : (
              <Lock className="w-3.5 h-3.5 text-muted-foreground" />
            )}
            <span>{isPublic ? 'Public on Portfolio' : 'Private Journal'}</span>
            <input
              id="capstone-reflection-public"
              type="checkbox"
              checked={isPublic}
              onChange={(e) => onChangeIsPublic(e.target.checked)}
              disabled={isLocked}
              className="w-4 h-4 rounded border-border text-primary focus:ring-primary focus:ring-offset-0 bg-background"
            />
          </label>
        </div>
      </div>

      {/* Reflection Content Body */}
      <div className="space-y-3 pt-2">
        <textarea
          value={content}
          onChange={(e) => onChangeContent(e.target.value)}
          disabled={isLocked}
          rows={4}
          placeholder="What were your biggest tradeoffs or breakthroughs while completing this capstone? How will you apply this on real product teams?"
          className="w-full p-3.5 rounded-lg border border-border bg-background text-foreground placeholder:text-muted-foreground/50 text-xs md:text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 leading-relaxed resize-y"
          aria-label="Personal Reflection Text"
        />

        <div className="flex items-center justify-between text-[11px] text-muted-foreground">
          <span>Reflections earn +15 XP when submitted.</span>
          {isPublic && (
            <span className="flex items-center gap-1 text-emerald-500 font-semibold">
              <Check className="w-3 h-3" /> Will be attached to public profile export
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
