'use client'

import React from 'react'
import Link from 'next/link'
import { Shield, ArrowRight, CheckCircle2 } from 'lucide-react'

interface NextCapstonePromptCardProps {
  prompt: {
    moduleSlug: string
    moduleNumber: number
    title: string
    deliverableType: string
  } | null
  submittedCount: number
}

export function NextCapstonePromptCard({ prompt, submittedCount }: NextCapstonePromptCardProps) {
  if (!prompt) {
    return (
      <div className="p-5 rounded-2xl border border-border/80 bg-card/60 space-y-3 flex flex-col justify-between shadow-xs">
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-blue-400 flex items-center gap-1.5">
              <Shield className="w-3.5 h-3.5" /> Capstone Deliverables
            </span>
            <span className="text-[9px] font-bold uppercase px-2 py-0.5 rounded border bg-emerald-500/10 text-emerald-400 border-emerald-500/20">
              {submittedCount === 9 ? '9/9 Complete' : `${submittedCount}/9 Submitted`}
            </span>
          </div>

          <h3 className="text-sm font-bold font-serif text-foreground">
            {submittedCount === 9
              ? 'All 9 Module Capstones Submitted!'
              : 'Complete Module Lessons to Unlock Capstone'}
          </h3>
          <p className="text-xs text-muted-foreground leading-relaxed">
            {submittedCount === 9
              ? 'You have submitted capstone deliverables for all 9 core modules.'
              : 'Finish all lessons in your current module to unlock its capstone workspace.'}
          </p>
        </div>

        <Link
          href="/capstones"
          className="inline-flex items-center justify-between text-xs font-bold text-blue-400 hover:text-blue-300 pt-2 border-t border-border/40 transition-colors"
        >
          <span className="flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> View Capstone Workspace
          </span>
          <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>
    )
  }

  return (
    <div className="p-5 rounded-2xl border border-blue-500/30 bg-blue-500/5 space-y-3 flex flex-col justify-between shadow-xs">
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-bold uppercase tracking-wider text-blue-400 flex items-center gap-1.5">
            <Shield className="w-3.5 h-3.5" /> Next Capstone Ready
          </span>
          <span className="text-[9px] font-bold uppercase px-2 py-0.5 rounded border bg-blue-500/20 text-blue-400 border-blue-500/30">
            Module {prompt.moduleNumber} Ready
          </span>
        </div>

        <h3 className="text-sm font-bold font-serif text-foreground">
          {prompt.title}
        </h3>
        <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">
          {prompt.deliverableType}
        </p>
      </div>

      <Link
        href={`/capstones/${prompt.moduleSlug}`}
        className="inline-flex items-center justify-between text-xs font-bold text-blue-400 hover:text-blue-300 pt-2 border-t border-blue-500/20 transition-colors"
      >
        <span>Open Module {prompt.moduleNumber} Workspace</span>
        <ArrowRight className="w-3.5 h-3.5" />
      </Link>
    </div>
  )
}
