'use client'

import React, { useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { Shield, Key, Lock, Loader2, CheckCircle2, AlertCircle, Eye, EyeOff, Mail, Send } from 'lucide-react'

function ChangeEmailCard() {
  const searchParams = useSearchParams()

  const [currentEmail, setCurrentEmail] = useState<string | null>(null)
  const [loadingEmail, setLoadingEmail] = useState(true)
  const [emailPassword, setEmailPassword] = useState('')
  const [showEmailPassword, setShowEmailPassword] = useState(false)
  const [newEmail, setNewEmail] = useState('')
  const [submittingEmail, setSubmittingEmail] = useState(false)
  const [emailSuccessMsg, setEmailSuccessMsg] = useState<string | null>(null)
  const [emailErrorMsg, setEmailErrorMsg] = useState<string | null>(null)

  // Reflect the outcome of clicking the confirmation link (redirected back here
  // by /api/auth/callback) without needing any server-detected "pending" state.
  const confirmedFromCallback = searchParams.get('emailChanged') === 'true'
  const failedFromCallback = searchParams.get('error') === 'email_change_failed'

  useEffect(() => {
    let isMounted = true
    fetch('/api/settings/security/change-email')
      .then((res) => res.json())
      .then((json) => {
        if (isMounted && json.success) setCurrentEmail(json.email)
      })
      .catch(() => {})
      .finally(() => {
        if (isMounted) setLoadingEmail(false)
      })
    return () => {
      isMounted = false
    }
  }, [])

  const handleChangeEmail = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!emailPassword) {
      setEmailErrorMsg('Current password is required.')
      return
    }
    if (!newEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) {
      setEmailErrorMsg('Please enter a valid email address.')
      return
    }

    setSubmittingEmail(true)
    setEmailSuccessMsg(null)
    setEmailErrorMsg(null)

    try {
      const res = await fetch('/api/settings/security/change-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword: emailPassword, newEmail }),
      })

      const data = await res.json()
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to start email change. Please try again.')
      }

      setEmailSuccessMsg(data.message || `Confirmation link sent to ${newEmail}.`)
      setEmailPassword('')
      setNewEmail('')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'An error occurred while changing your email.'
      setEmailErrorMsg(msg)
    } finally {
      setSubmittingEmail(false)
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
          <p className="text-sm text-foreground font-mono">{currentEmail || '—'}</p>
        )}
      </div>

      {confirmedFromCallback && (
        <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-xs font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-2" role="status">
          <CheckCircle2 className="w-4 h-4 shrink-0" /> Your email address has been updated successfully.
        </div>
      )}
      {failedFromCallback && (
        <div className="p-3 rounded-xl bg-destructive/10 border border-destructive/20 text-xs font-semibold text-destructive flex items-center gap-2" role="alert">
          <AlertCircle className="w-4 h-4 shrink-0" /> That confirmation link is invalid or has expired. Please request the change again.
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <label htmlFor="settings-email-password" className="block text-xs font-semibold text-foreground">
            Current Password
          </label>
          <div className="relative">
            <input
              id="settings-email-password"
              type={showEmailPassword ? 'text' : 'password'}
              required
              disabled={submittingEmail}
              value={emailPassword}
              onChange={(e) => setEmailPassword(e.target.value)}
              placeholder="Confirm it's you"
              className="w-full rounded-xl border border-input bg-background px-3.5 py-2.5 pr-10 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 disabled:opacity-50 disabled:cursor-not-allowed"
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
          <input
            id="settings-new-email"
            type="email"
            required
            disabled={submittingEmail}
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            placeholder="you@newdomain.com"
            className="w-full rounded-xl border border-input bg-background px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 disabled:opacity-50 disabled:cursor-not-allowed"
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

        <button
          type="submit"
          disabled={submittingEmail || !emailPassword || !newEmail}
          className="flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-xs font-bold text-primary-foreground hover:bg-primary/90 transition-all shadow-xs disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
        >
          {submittingEmail ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          {submittingEmail ? 'Sending...' : 'Send Confirmation Link'}
        </button>
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

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!currentPassword) {
      setErrorMessage('Current password is required.')
      return
    }

    if (newPassword.length < 6) {
      setErrorMessage('New password must be at least 6 characters long.')
      return
    }

    if (newPassword !== confirmPassword) {
      setErrorMessage('New passwords do not match.')
      return
    }

    if (currentPassword === newPassword) {
      setErrorMessage('New password must be different from your current password.')
      return
    }

    setSaving(true)
    setSuccessMessage(false)
    setErrorMessage(null)

    try {
      const res = await fetch('/api/settings/security', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentPassword,
          newPassword,
          confirmPassword,
        }),
      })

      const data = await res.json()
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to update password. Please try again.')
      }

      setSuccessMessage(true)
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      setTimeout(() => setSuccessMessage(false), 4000)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'An error occurred while changing password.'
      setErrorMessage(msg)
    } finally {
      setSaving(false)
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
              <input
                id="settings-current-password"
                type={showCurrentPassword ? 'text' : 'password'}
                required
                disabled={saving}
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="Enter current password"
                className="w-full rounded-xl border border-input bg-background px-3.5 py-2.5 pr-10 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 disabled:opacity-50 disabled:cursor-not-allowed"
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
                <input
                  id="settings-new-password"
                  type={showNewPassword ? 'text' : 'password'}
                  required
                  disabled={saving}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Minimum 6 characters"
                  className="w-full rounded-xl border border-input bg-background px-3.5 py-2.5 pr-10 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 disabled:opacity-50 disabled:cursor-not-allowed"
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
                <input
                  id="settings-confirm-password"
                  type={showConfirmPassword ? 'text' : 'password'}
                  required
                  disabled={saving}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter new password"
                  className="w-full rounded-xl border border-input bg-background px-3.5 py-2.5 pr-10 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 disabled:opacity-50 disabled:cursor-not-allowed"
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
          </div>

          <button
            type="submit"
            disabled={saving || !currentPassword || !newPassword || !confirmPassword}
            className="flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-xs font-bold text-primary-foreground hover:bg-primary/90 transition-all shadow-xs disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
            {saving ? 'Updating...' : 'Update Password'}
          </button>
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
