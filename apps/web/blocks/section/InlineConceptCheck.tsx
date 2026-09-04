'use client'

import React, { useState } from 'react'
import { CheckCircle2, Sparkles, HelpCircle } from 'lucide-react'

interface InlineConceptCheckProps {
  conceptTitle?: string
  prompt?: string
}

export function InlineConceptCheck({
  conceptTitle = 'Core PM Takeaway',
  prompt = 'Have you applied or seen this concept in your product work?',
}: InlineConceptCheckProps) {
  const [checked, setChecked] = useState(false)

  return (
    <div className="my-4 rounded-xl border border-primary/20 bg-card/60 p-4 transition-all duration-200">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-start gap-2.5">
          <div className="p-1.5 rounded-lg bg-primary/10 text-primary mt-0.5 shrink-0">
            {checked ? <Sparkles className="w-4 h-4 text-emerald-500" /> : <HelpCircle className="w-4 h-4" />}
          </div>
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-primary block">
              Quick Reflection Checkpoint
            </span>
            <p className="text-xs text-foreground font-medium leading-snug mt-0.5">
              {prompt}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setChecked(!checked)}
          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 shrink-0 cursor-pointer ${
            checked
              ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/30'
              : 'bg-secondary hover:bg-primary hover:text-primary-foreground text-foreground border border-border'
          }`}
        >
          <CheckCircle2 className={`w-3.5 h-3.5 ${checked ? 'text-emerald-500' : ''}`} />
          <span>{checked ? 'Understood ✓' : 'Mark Understood'}</span>
        </button>
      </div>
    </div>
  )
}
