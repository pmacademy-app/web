'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { createBrowserSupabaseClient } from '@/lib/supabase'

export default function ResetPasswordPage() {
  const [email, setEmail] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [isUpdateMode, setIsUpdateMode] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const handleResetRequest = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrorMsg(null)
    setMessage(null)

    startTransition(async () => {
      try {
        const supabase = createBrowserSupabaseClient()
        const origin = window.location.origin
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${origin}/reset-password?mode=update`,
        })

        if (error) {
          setErrorMsg(error.message)
          return
        }

        setMessage('Password reset link sent! Check your inbox.')
      } catch (err) {
        console.error('[reset-password] Request error:', err)
        setErrorMsg('An unexpected error occurred. Please try again.')
      }
    })
  }

  const handlePasswordUpdate = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrorMsg(null)
    setMessage(null)

    if (newPassword.length < 6) {
      setErrorMsg('Password must be at least 6 characters.')
      return
    }

    startTransition(async () => {
      try {
        const supabase = createBrowserSupabaseClient()
        const { error } = await supabase.auth.updateUser({
          password: newPassword,
        })

        if (error) {
          setErrorMsg(error.message)
          return
        }

        setMessage('Password updated successfully! You can now log in.')
      } catch (err) {
        console.error('[reset-password] Update error:', err)
        setErrorMsg('An unexpected error occurred. Please try again.')
      }
    })
  }

  return (
    <div className="container mx-auto px-4 py-16 max-w-sm">
      <div className="text-center mb-8">
        <h1 className="text-2xl font-bold font-serif text-foreground mb-2">
          {isUpdateMode ? 'Set New Password' : 'Reset Your Password'}
        </h1>
        <p className="text-xs text-muted-foreground">
          {isUpdateMode
            ? 'Enter your new password below.'
            : "Enter your email and we'll send you a password reset link."}
        </p>
      </div>

      <div className="rounded-xl border border-border bg-card p-6 shadow-sm space-y-4">
        {errorMsg && (
          <div className="p-3 text-xs rounded-lg bg-destructive/10 border border-destructive/20 text-destructive font-medium">
            {errorMsg}
          </div>
        )}

        {message && (
          <div className="p-3 text-xs rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 font-medium">
            {message}
          </div>
        )}

        {!isUpdateMode ? (
          <form onSubmit={handleResetRequest} className="space-y-4">
            <div>
              <label htmlFor="reset-email" className="block text-xs font-semibold uppercase text-foreground/80 mb-1">
                Email Address
              </label>
              <input
                id="reset-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="jane@example.com"
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>

            <button
              type="submit"
              disabled={isPending}
              className="w-full rounded-lg bg-primary py-2.5 text-sm font-medium text-primary-foreground shadow hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {isPending ? 'Sending Link...' : 'Send Reset Link →'}
            </button>
          </form>
        ) : (
          <form onSubmit={handlePasswordUpdate} className="space-y-4">
            <div>
              <label htmlFor="new-password" className="block text-xs font-semibold uppercase text-foreground/80 mb-1">
                New Password
              </label>
              <input
                id="new-password"
                type="password"
                required
                minLength={6}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Min. 6 characters"
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>

            <button
              type="submit"
              disabled={isPending}
              className="w-full rounded-lg bg-primary py-2.5 text-sm font-medium text-primary-foreground shadow hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {isPending ? 'Updating Password...' : 'Update Password'}
            </button>
          </form>
        )}

        <div className="mt-6 text-center text-xs text-muted-foreground border-t border-border pt-4 flex justify-between items-center">
          <Link href="/login" className="font-semibold text-primary hover:underline">
            ← Back to Log in
          </Link>
          <button
            type="button"
            onClick={() => {
              setIsUpdateMode(!isUpdateMode)
              setErrorMsg(null)
              setMessage(null)
            }}
            className="text-muted-foreground hover:underline text-[11px]"
          >
            {isUpdateMode ? 'Need reset email?' : 'Have reset token?'}
          </button>
        </div>
      </div>
    </div>
  )
}
