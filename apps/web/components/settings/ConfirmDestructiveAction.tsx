'use client'

import React, { useState } from 'react'
import { AlertTriangle, X, Loader2 } from 'lucide-react'

export interface ConfirmDestructiveActionProps {
  isOpen: boolean
  title: string
  description: string
  plainLanguageLossSummary: string
  confirmationKeyword: string
  confirmButtonText: string
  onConfirm: () => Promise<void>
  onClose: () => void
  isDestructive?: boolean
}

export function ConfirmDestructiveAction({
  isOpen,
  title,
  description,
  plainLanguageLossSummary,
  confirmationKeyword,
  confirmButtonText,
  onConfirm,
  onClose,
  isDestructive = true,
}: ConfirmDestructiveActionProps) {
  const [typedInput, setTypedInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  if (!isOpen) return null

  const isExactMatch = typedInput.trim() === confirmationKeyword

  const handleConfirm = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!isExactMatch) {
      setErrorMessage(`Confirmation text must match exactly: "${confirmationKeyword}" (case sensitive).`)
      return
    }

    setLoading(true)
    setErrorMessage(null)

    try {
      await onConfirm()
      setTypedInput('')
      onClose()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'An error occurred during execution.'
      setErrorMessage(msg)
    } finally {
      setLoading(false)
    }
  }

  const handleClose = () => {
    if (loading) return
    setTypedInput('')
    setErrorMessage(null)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-background/80 backdrop-blur-sm animate-in fade-in-0">
      <div
        className="relative w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl border border-destructive/30 bg-card p-4 sm:p-6 shadow-2xl space-y-5 sm:space-y-6"
        role="dialog"
        aria-modal="true"
        aria-labelledby="destructive-dialog-title"
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-destructive/10 text-destructive">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div>
              <h3 id="destructive-dialog-title" className="text-lg font-bold text-foreground">
                {title}
              </h3>
              <p className="text-xs text-muted-foreground">{description}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClose}
            disabled={loading}
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors disabled:opacity-50"
            aria-label="Close dialog"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Plain Language Summary Box */}
        <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-4 text-xs space-y-1.5 leading-relaxed text-foreground">
          <p className="font-bold text-destructive flex items-center gap-1.5">
            <span>What will happen:</span>
          </p>
          <p className="text-muted-foreground">{plainLanguageLossSummary}</p>
        </div>

        {/* Typed Confirmation Input */}
        <form onSubmit={handleConfirm} className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="confirmation-input" className="block text-xs font-semibold text-foreground">
              To confirm, type <span className="font-mono font-bold text-destructive">{confirmationKeyword}</span> below:
            </label>
            <input
              id="confirmation-input"
              type="text"
              value={typedInput}
              onChange={(e) => {
                setTypedInput(e.target.value)
                if (errorMessage) setErrorMessage(null)
              }}
              placeholder={`Type "${confirmationKeyword}" to confirm`}
              disabled={loading}
              autoFocus
              className="w-full rounded-xl border border-input bg-background px-3.5 py-2.5 text-sm font-mono placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-destructive/50 disabled:opacity-50"
            />
            {errorMessage && (
              <p className="text-xs text-destructive font-medium animate-in fade-in-0">
                {errorMessage}
              </p>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-2.5 sm:gap-3 pt-2">
            <button
              type="button"
              onClick={handleClose}
              disabled={loading}
              className="w-full sm:w-auto rounded-xl border border-border px-4 py-2.5 text-xs font-semibold text-foreground hover:bg-secondary transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!isExactMatch || loading}
              className={`w-full sm:w-auto flex items-center justify-center gap-2 rounded-xl px-5 py-2.5 text-xs font-bold transition-all shadow-sm ${
                isDestructive
                  ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90 disabled:opacity-40 disabled:hover:bg-destructive'
                  : 'bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40'
              }`}
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              {confirmButtonText}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
