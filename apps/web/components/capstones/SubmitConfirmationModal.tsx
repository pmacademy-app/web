'use client'

import React from 'react'
import { AlertTriangle, Award, CheckCircle2, X } from 'lucide-react'
import type { CapstoneValidationResult } from '@/lib/capstones'

interface SubmitConfirmationModalProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: () => void
  validation: CapstoneValidationResult
  isSubmitting: boolean
  moduleTitle: string
}

export function SubmitConfirmationModal({
  isOpen,
  onClose,
  onConfirm,
  validation,
  isSubmitting,
  moduleTitle,
}: SubmitConfirmationModalProps) {
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
              Submitting will lock this capstone workspace, record your deliverable, and award{' '}
              <strong className="text-foreground">+150 XP</strong>.
            </p>
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
            onClick={onConfirm}
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
