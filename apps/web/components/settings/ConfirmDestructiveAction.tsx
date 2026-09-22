'use client'

import React, { useState } from 'react'
import { AlertTriangle, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/50 animate-in fade-in-0">
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
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={handleClose}
            disabled={loading}
            aria-label="Close dialog"
          >
            <X className="h-4 w-4" />
          </Button>
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
            <Input
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
              error={!!errorMessage}
              className="rounded-xl font-mono"
            />
            {errorMessage && (
              <p className="text-xs text-destructive font-medium animate-in fade-in-0">
                {errorMessage}
              </p>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-2.5 sm:gap-3 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              disabled={loading}
              className="w-full sm:w-auto rounded-xl"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant={isDestructive ? 'destructive' : 'default'}
              loading={loading}
              disabled={!isExactMatch || loading}
              className="w-full sm:w-auto rounded-xl"
            >
              {confirmButtonText}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
