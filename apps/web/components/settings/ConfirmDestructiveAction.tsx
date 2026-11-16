'use client'

import React, { useState } from 'react'
import { AlertTriangle, Eye, EyeOff, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'

export interface ConfirmDestructiveActionProps {
  isOpen: boolean
  title: string
  description: string
  plainLanguageLossSummary: string
  confirmationKeyword: string
  confirmButtonText: string
  hasPassword?: boolean
  onConfirm: (payload: { currentPassword?: string; confirmationPhrase?: string }) => Promise<void>
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
  hasPassword = true,
  onConfirm,
  onClose,
  isDestructive = true,
}: ConfirmDestructiveActionProps) {
  const [typedInput, setTypedInput] = useState('')
  const [passwordInput, setPasswordInput] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  if (!isOpen) return null

  const isExactMatch = typedInput.trim() === confirmationKeyword
  const isSubmitDisabled = !isExactMatch || (hasPassword && !passwordInput.trim()) || loading

  const handleConfirm = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!isExactMatch) {
      setErrorMessage(`Confirmation text must match exactly: "${confirmationKeyword}" (case sensitive).`)
      return
    }

    if (hasPassword && !passwordInput.trim()) {
      setErrorMessage('Current password is required.')
      return
    }

    setLoading(true)
    setErrorMessage(null)

    try {
      await onConfirm({
        currentPassword: hasPassword ? passwordInput : undefined,
        confirmationPhrase: typedInput.trim(),
      })
      setTypedInput('')
      setPasswordInput('')
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
    setPasswordInput('')
    setErrorMessage(null)
    onClose()
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent
        showCloseButton={false}
        className="block relative w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl border border-destructive/30 bg-card p-4 sm:p-6 shadow-2xl space-y-5 sm:space-y-6"
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-destructive/10 text-destructive">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div>
              <DialogTitle className="text-lg font-bold text-foreground">
                {title}
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">{description}</DialogDescription>
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

        {/* Google Authentication Notice */}
        {!hasPassword && (
          <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 text-xs space-y-1">
            <p className="font-semibold text-foreground">Google Account Verification</p>
            <p className="text-muted-foreground">
              Your account signs in with Google. Destructive actions require a recent sign-in (within the last 10 minutes) and typed confirmation.
            </p>
          </div>
        )}

        {/* Confirmation Form */}
        <form onSubmit={handleConfirm} className="space-y-4">
          {/* Password Input for Password Accounts */}
          {hasPassword && (
            <div className="space-y-2">
              <label htmlFor="destructive-password-input" className="block text-xs font-semibold text-foreground">
                Current Password
              </label>
              <div className="relative">
                <Input
                  id="destructive-password-input"
                  type={showPassword ? 'text' : 'password'}
                  value={passwordInput}
                  onChange={(e) => {
                    setPasswordInput(e.target.value)
                    if (errorMessage) setErrorMessage(null)
                  }}
                  placeholder="Enter current password to authorize"
                  disabled={loading}
                  error={!!errorMessage && !passwordInput.trim()}
                  className="rounded-xl pr-10"
                  autoComplete="current-password"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-primary h-7 w-7"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </Button>
              </div>
            </div>
          )}

          {/* Typed Confirmation Keyword Input */}
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
              autoFocus={!hasPassword}
              error={!!errorMessage}
              className="rounded-xl font-mono"
            />
          </div>

          {errorMessage && (
            <p className="text-xs text-destructive font-medium animate-in fade-in-0" role="alert">
              {errorMessage}
            </p>
          )}

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
              disabled={isSubmitDisabled}
              className="w-full sm:w-auto rounded-xl"
            >
              {confirmButtonText}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
