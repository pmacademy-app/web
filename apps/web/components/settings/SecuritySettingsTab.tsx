'use client'

import React, { useState } from 'react'
import { Shield, Key, Lock, Loader2, CheckCircle2, AlertCircle, Eye, EyeOff, Mail, Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useApiQuery } from '@/lib/api/hooks'
import { apiPost } from '@/lib/api/client'
import { useDirtyFormGuard } from '@/hooks/use-dirty-form-guard'
import { showClientToast } from '@/lib/events/client-event-bus'
import type {
  ChangeEmailGetResponse,
  ChangeEmailPostResponse,
  SecurityUpdateResponse,
} from '@/lib/api/contracts/settings'

function ChangeEmailCard() {
  const [emailPassword, setEmailPassword] = useState('')
  const [showEmailPassword, setShowEmailPassword] = useState(false)
  const [newEmail, setNewEmail] = useState('')
  const [submittingEmail, setSubmittingEmail] = useState(false)
  const [emailSuccessMsg, setEmailSuccessMsg] = useState<string | null>(null)
  const [emailErrorMsg, setEmailErrorMsg] = useState<string | null>(null)

  const isEmailDirty = emailPassword.length > 0 || newEmail.length > 0
  useDirtyFormGuard(isEmailDirty)

  const { data: emailData, isLoading: loadingEmail, mutate: mutateEmail } =
    useApiQuery<ChangeEmailGetResponse>('/api/settings/security/change-email')

  const currentEmail = emailData?.email ?? null

  const handleChangeEmail = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!emailPassword) {
      const msg = 'Current password is required.'
      setEmailErrorMsg(msg)
      showClientToast('Email Change Failed', msg, 'error')
      return
    }
    if (!newEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) {
      const msg = 'Please enter a valid email address.'
      setEmailErrorMsg(msg)
      showClientToast('Email Change Failed', msg, 'error')
      return
    }

    setSubmittingEmail(true)
    setEmailSuccessMsg(null)
    setEmailErrorMsg(null)

    try {
      const result = await apiPost<ChangeEmailPostResponse>('/api/settings/security/change-email', {
        currentPassword: emailPassword,
        newEmail,
      })

      setSubmittingEmail(false)

      if (!result.ok) {
        const errorText = result.error.message
        setEmailErrorMsg(errorText)
        showClientToast('Email Change Failed', errorText, 'error')
        return
      }

      if (!result.data.success) {
        const errorText = result.data.error || 'Failed to start email change. Please try again.'
        setEmailErrorMsg(errorText)
        showClientToast('Email Change Failed', errorText, 'error')
        return
      }

      const successText = result.data.message || `Confirmation link sent to ${newEmail}.`
      setEmailSuccessMsg(successText)
      showClientToast('Confirmation Sent', successText, 'success')
      setEmailPassword('')
      setNewEmail('')
      void mutateEmail()
    } catch (err) {
      setSubmittingEmail(false)
      const errorText = err instanceof Error ? err.message : 'Network error updating email.'
      setEmailErrorMsg(errorText)
      showClientToast('Email Change Failed', errorText, 'error')
    }
  }

  return (
    <form onSubmit={handleChangeEmail} className="rounded-2xl border border-border bg-card p-6 shadow-xs space-y-6">
      <div className="flex items-center justify-between border-b border-border pb-4">
        <div>
          <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
            <Mail className="w-5 h-5 text-primary" />
            Change Email
          </h2>
          <p className="text-xs text-muted-foreground">
            Update the email address used to sign in. You&apos;ll need to confirm the change from your new inbox.
          </p>
        </div>
      </div>

      <div className="space-y-1.5 max-w-md">
        <span className="block text-xs font-semibold text-foreground">Current Email</span>
        {loadingEmail ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading...
          </div>
        ) : (
          <p className="text-sm text-foreground font-mono">{currentEmail || '-'}</p>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <label htmlFor="settings-email-password" className="block text-xs font-semibold text-foreground">
            Current Password
          </label>
          <div className="relative">
            <Input
              id="settings-email-password"
              type={showEmailPassword ? 'text' : 'password'}
              required
              disabled={submittingEmail}
              value={emailPassword}
              onChange={(e) => setEmailPassword(e.target.value)}
              placeholder="Confirm it's you"
              className="rounded-xl pr-10"
            />
            <button
              type="button"
              onClick={() => setShowEmailPassword(!showEmailPassword)}
              aria-label={showEmailPassword ? 'Hide password' : 'Show password'}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-1 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              {showEmailPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="settings-new-email" className="block text-xs font-semibold text-foreground">
            New Email Address
          </label>
          <Input
            id="settings-new-email"
            type="email"
            required
            disabled={submittingEmail}
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            placeholder="you@newdomain.com"
            className="rounded-xl"
          />
        </div>
      </div>

      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pt-4 border-t border-border">
        <div className="flex-1">
          {emailSuccessMsg && (
            <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5 animate-in fade-in-0" role="status">
              <CheckCircle2 className="w-4 h-4 shrink-0" /> {emailSuccessMsg}
            </span>
          )}
          {emailErrorMsg && (
            <span className="text-xs font-semibold text-destructive flex items-center gap-1.5 animate-in fade-in-0" role="alert">
              <AlertCircle className="w-4 h-4 shrink-0" /> {emailErrorMsg}
            </span>
          )}
        </div>

        <Button
          type="submit"
          loading={submittingEmail}
          disabled={submittingEmail || !emailPassword || !newEmail}
          size="sm"
          className="rounded-xl"
        >
          {!submittingEmail && <Send className="w-4 h-4" />}
          {submittingEmail ? 'Sending...' : 'Send Confirmation Link'}
        </Button>
      </div>
    </form>
  )
}

export function SecuritySettingsTab() {
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showCurrentPassword, setShowCurrentPassword] = useState(false)
  const [showNewPassword, setShowNewPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [saving, setSaving] = useState(false)
  const [successMessage, setSuccessMessage] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const saveCountRef = React.useRef(0)

  const isPasswordDirty = currentPassword.length > 0 || newPassword.length > 0 || confirmPassword.length > 0
  useDirtyFormGuard(isPasswordDirty)

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!currentPassword) {
      const msg = 'Current password is required.'
      setErrorMessage(msg)
      showClientToast('Password Update Failed', msg, 'error')
      return
    }

    if (newPassword.length < 6) {
      const msg = 'New password must be at least 6 characters long.'
      setErrorMessage(msg)
      showClientToast('Password Update Failed', msg, 'error')
      return
    }

    if (newPassword !== confirmPassword) {
      const msg = 'New passwords do not match.'
      setErrorMessage(msg)
      showClientToast('Password Update Failed', msg, 'error')
      return
    }

    if (currentPassword === newPassword) {
      const msg = 'New password must be different from your current password.'
      setErrorMessage(msg)
      showClientToast('Password Update Failed', msg, 'error')
      return
    }

    if (saving) return
    const currentSaveId = ++saveCountRef.current
    setSaving(true)
    setSuccessMessage(false)
    setErrorMessage(null)

    try {
      const result = await apiPost<SecurityUpdateResponse>('/api/settings/security', {
        currentPassword,
        newPassword,
        confirmPassword,
      })

      if (currentSaveId !== saveCountRef.current) return

      if (!result.ok) {
        const errorText = result.error.message
        setErrorMessage(errorText)
        showClientToast('Password Update Failed', errorText, 'error')
        return
      }

      if (!result.data.success) {
        const errorText = result.data.error || 'Failed to update password. Please try again.'
        setErrorMessage(errorText)
        showClientToast('Password Update Failed', errorText, 'error')
        return
      }

      setSuccessMessage(true)
      showClientToast('Password Updated', 'Your account password has been updated.', 'success')
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      setTimeout(() => setSuccessMessage(false), 4000)
    } catch (err) {
      if (currentSaveId !== saveCountRef.current) return
      const errorText = err instanceof Error ? err.message : 'Network error updating password.'
      setErrorMessage(errorText)
      showClientToast('Password Update Failed', errorText, 'error')
    } finally {
      if (currentSaveId === saveCountRef.current) {
        setSaving(false)
      }
    }
  }

  return (
    <div className="space-y-6">
      {/* Change Email Card */}
      <ChangeEmailCard />

      {/* Password Update Card */}
      <form onSubmit={handlePasswordChange} className="rounded-2xl border border-border bg-card p-6 shadow-xs space-y-6">
        <div className="flex items-center justify-between border-b border-border pb-4">
          <div>
            <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
              <Key className="w-5 h-5 text-primary" />
              Change Password
            </h2>
            <p className="text-xs text-muted-foreground">
              Update your account password to maintain maximum account security.
            </p>
          </div>
        </div>

        <div className="space-y-4">
          {/* Current Password */}
          <div className="space-y-1.5 max-w-md">
            <label htmlFor="settings-current-password" className="block text-xs font-semibold text-foreground">
              Current Password
            </label>
            <div className="relative">
              <Input
                id="settings-current-password"
                type={showCurrentPassword ? 'text' : 'password'}
                required
                disabled={saving}
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="Enter current password"
                className="rounded-xl pr-10"
              />
              <button
                type="button"
                onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                aria-label={showCurrentPassword ? 'Hide current password' : 'Show current password'}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-1 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                {showCurrentPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* New Password */}
            <div className="space-y-1.5">
              <label htmlFor="settings-new-password" className="block text-xs font-semibold text-foreground">
                New Password
              </label>
              <div className="relative">
                <Input
                  id="settings-new-password"
                  type={showNewPassword ? 'text' : 'password'}
                  required
                  disabled={saving}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Minimum 6 characters"
                  className="rounded-xl pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowNewPassword(!showNewPassword)}
                  aria-label={showNewPassword ? 'Hide new password' : 'Show new password'}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-1 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Must be at least 6 characters long.
              </p>
            </div>

            {/* Confirm New Password */}
            <div className="space-y-1.5">
              <label htmlFor="settings-confirm-password" className="block text-xs font-semibold text-foreground">
                Confirm New Password
              </label>
              <div className="relative">
                <Input
                  id="settings-confirm-password"
                  type={showConfirmPassword ? 'text' : 'password'}
                  required
                  disabled={saving}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter new password"
                  className="rounded-xl pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  aria-label={showConfirmPassword ? 'Hide confirm password' : 'Show confirm password'}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-1 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pt-4 border-t border-border">
          <div className="flex-1">
            {successMessage && (
              <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5 animate-in fade-in-0" role="status">
                <CheckCircle2 className="w-4 h-4 shrink-0" /> Password updated successfully!
              </span>
            )}
            {errorMessage && (
              <span className="text-xs font-semibold text-destructive flex items-center gap-1.5 animate-in fade-in-0" role="alert">
                <AlertCircle className="w-4 h-4 shrink-0" /> {errorMessage}
              </span>
            )}
            {!successMessage && !errorMessage && isPasswordDirty && (
              <span className="text-[11px] font-medium text-amber-600 dark:text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2.5 py-1 rounded-md">
                Unsaved changes
              </span>
            )}
          </div>

          <Button
            type="submit"
            loading={saving}
            disabled={saving || !currentPassword || !newPassword || !confirmPassword}
            size="sm"
            className="rounded-xl"
          >
            {!saving && <Lock className="w-4 h-4" />}
            {saving ? 'Updating...' : 'Update Password'}
          </Button>
        </div>
      </form>

      {/* Session Security Overview */}
      <div className="rounded-2xl border border-border bg-card p-6 shadow-xs space-y-4">
        <div className="flex items-center gap-2 border-b border-border pb-3">
          <Shield className="w-5 h-5 text-primary" />
          <h2 className="text-sm font-bold text-foreground">
            Account Security & Authentication
          </h2>
        </div>

        <div className="text-xs text-muted-foreground space-y-2 leading-relaxed">
          <p>
            Your account authentication is secured by Supabase Auth with Row Level Security (RLS) policies protecting all user state data.
          </p>
          <p>
            Every mutation re-derives authorization from the server session; user IDs passed in client request bodies are never trusted.
          </p>
        </div>
      </div>
    </div>
  )
}
