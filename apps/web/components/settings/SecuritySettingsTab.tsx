'use client'

import React, { useState } from 'react'
import { Shield, Key, Lock, Loader2, CheckCircle2, AlertCircle } from 'lucide-react'

export function SecuritySettingsTab() {
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [saving, setSaving] = useState(false)
  const [successMessage, setSuccessMessage] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault()

    if (newPassword.length < 8) {
      setErrorMessage('Password must be at least 8 characters long.')
      return
    }

    if (newPassword !== confirmPassword) {
      setErrorMessage('New passwords do not match.')
      return
    }

    setSaving(true)
    setSuccessMessage(false)
    setErrorMessage(null)

    try {
      const res = await fetch('/api/settings/security', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: newPassword }),
      })

      const data = await res.json()
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to update password.')
      }

      setSuccessMessage(true)
      setNewPassword('')
      setConfirmPassword('')
      setTimeout(() => setSuccessMessage(false), 3000)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'An error occurred while changing password.'
      setErrorMessage(msg)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Password Update Card */}
      <form onSubmit={handlePasswordChange} className="rounded-2xl border border-border bg-card p-6 shadow-xs space-y-6">
        <div className="flex items-center justify-between border-b border-border pb-4">
          <div>
            <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
              <Key className="w-5 h-5 text-primary" />
              Change Password
            </h2>
            <p className="text-xs text-muted-foreground">
              Update your password to keep your account secure.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-foreground">
              New Password
            </label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Minimum 8 characters"
              className="w-full rounded-xl border border-input bg-background px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-foreground">
              Confirm New Password
            </label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Re-enter new password"
              className="w-full rounded-xl border border-input bg-background px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>
        </div>

        <div className="flex items-center justify-between pt-4 border-t border-border">
          <div>
            {successMessage && (
              <span className="text-xs font-semibold text-emerald-600 flex items-center gap-1.5 animate-in fade-in-0">
                <CheckCircle2 className="w-4 h-4" /> Password updated successfully!
              </span>
            )}
            {errorMessage && (
              <span className="text-xs font-semibold text-destructive flex items-center gap-1.5 animate-in fade-in-0">
                <AlertCircle className="w-4 h-4" /> {errorMessage}
              </span>
            )}
          </div>

          <button
            type="submit"
            disabled={saving || !newPassword}
            className="flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-xs font-bold text-primary-foreground hover:bg-primary/90 transition-all shadow-xs disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
            Update Password
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
