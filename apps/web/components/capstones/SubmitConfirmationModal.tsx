'use client'

import React, { useState } from 'react'
import { AlertTriangle, Award, CheckCircle2, Globe, Lock, X } from 'lucide-react'
import type { CapstoneValidationResult } from '@/lib/capstones'

interface SubmitConfirmationModalProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: (isPublic: boolean) => void
  validation: CapstoneValidationResult
  isSubmitting: boolean
  moduleTitle: string
  userProfile?: {
    username?: string
    isPortfolioPublic?: boolean
  } | null
}

export function SubmitConfirmationModal({
  isOpen,
  onClose,
  onConfirm,
  validation,
  isSubmitting,
  moduleTitle,
  userProfile,
}: SubmitConfirmationModalProps) {
  const defaultIsPublic = userProfile?.isPortfolioPublic ?? true
  const [overrideIsPublic, setOverrideIsPublic] = useState<boolean | null>(null)
  const isPublic = overrideIsPublic !== null ? overrideIsPublic : defaultIsPublic

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal Container */}
      <div className="relative w-full max-w-md bg-card border border-border rounded-xl shadow-2xl p-6 space-y-5 animate-in fade-in zoom-in-95 duration-200 z-10">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-emerald-500/10 text-emerald-500">
              <Award className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base font-bold font-serif text-foreground leading-tight">
                Submit Module Capstone
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">{moduleTitle}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Validation Check Summary */}
        {!validation.isValid ? (
          <div className="rounded-lg bg-amber-500/10 border border-amber-500/20 p-4 text-xs space-y-2 text-amber-500">
            <div className="flex items-center gap-2 font-bold text-amber-600 dark:text-amber-400">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>Requirements Not Met</span>
            </div>
            <ul className="list-disc list-inside space-y-1 text-muted-foreground leading-relaxed">
              {validation.missingRequirements.map((req, i) => (
                <li key={i}>{req}</li>
              ))}
            </ul>
          </div>
        ) : (
          <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/20 p-4 text-xs space-y-2">
            <div className="flex items-center gap-2 font-bold text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>Ready for Submission ({validation.wordCount} words)</span>
            </div>
            <p className="text-muted-foreground leading-relaxed">
              Submitting will record your proof-of-work deliverable and award{' '}
              <strong className="text-foreground">+150 XP</strong>.
            </p>
          </div>
        )}

        {/* Portfolio Visibility Context (Phase 4 Direct-to-Portfolio) */}
        {validation.isValid && (
          <div className="rounded-xl border border-border/80 bg-background/70 p-4 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                Portfolio Showcase
              </span>
              <span
                className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                  userProfile?.isPortfolioPublic !== false
                    ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
                    : 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20'
                }`}
              >
                {userProfile?.isPortfolioPublic !== false ? (
                  <>
                    <Globe className="w-3 h-3" /> Public Portfolio
                  </>
                ) : (
                  <>
                    <Lock className="w-3 h-3" /> Private Portfolio
                  </>
                )}
              </span>
            </div>

            <p className="text-[11px] text-muted-foreground leading-relaxed">
              {userProfile?.isPortfolioPublic !== false ? (
                <>
                  Your portfolio at <strong className="text-foreground font-mono">/p/{userProfile?.username || 'you'}</strong> is public. This deliverable will be showcased directly as a verified proof-of-work project.
                </>
              ) : (
                <>
                  Your portfolio is currently marked <strong>Private</strong> in Settings. This deliverable will be saved securely to your personal learning record, but will remain hidden from external visitors until you enable public portfolio sharing.
                </>
              )}
            </p>

            <label className="flex items-center gap-2.5 pt-1 text-xs cursor-pointer select-none text-foreground font-medium">
              <input
                type="checkbox"
                checked={isPublic}
                onChange={(e) => setOverrideIsPublic(e.target.checked)}
                className="rounded border-border text-primary focus:ring-primary h-4 w-4"
              />
              <span>Show this deliverable in my portfolio</span>
            </label>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="px-4 py-2 rounded-lg text-xs font-semibold border border-border text-foreground hover:bg-secondary/60 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onConfirm(isPublic)}
            disabled={!validation.isValid || isSubmitting}
            className="px-5 py-2 rounded-lg text-xs font-bold bg-primary text-primary-foreground hover:bg-primary/90 transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {isSubmitting ? (
              <>
                <span className="w-3.5 h-3.5 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                Submitting...
              </>
            ) : (
              'Confirm Submission (+150 XP)'
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
