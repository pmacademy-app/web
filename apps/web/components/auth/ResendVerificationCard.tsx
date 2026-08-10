'use client'

import React, { useState, useEffect } from 'react'
import { Mail, RefreshCw, CheckCircle2, AlertCircle } from 'lucide-react'

interface ResendVerificationCardProps {
  email?: string
  initialCooldown?: number
  onSuccess?: () => void
}

export function ResendVerificationCard({
  email,
  initialCooldown = 0,
  onSuccess,
}: ResendVerificationCardProps) {
  const [cooldown, setCooldown] = useState<number>(initialCooldown)
  const [loading, setLoading] = useState<boolean>(false)
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  useEffect(() => {
    if (cooldown <= 0) return
    const timer = setInterval(() => {
      setCooldown((prev) => (prev > 0 ? prev - 1 : 0))
    }, 1000)
    return () => clearInterval(timer)
  }, [cooldown])

  const handleResend = async () => {
    if (cooldown > 0 || loading) return
    setLoading(true)
    setStatusMessage(null)

    try {
      const res = await fetch('/api/auth/resend-verification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })

      const data = await res.json()

      if (res.ok && data.success) {
        setStatusMessage({ type: 'success', text: data.message || 'Verification email sent successfully!' })
        setCooldown(60)
        onSuccess?.()
      } else {
        const errorText = data.error || 'Failed to send verification email.'
        setStatusMessage({ type: 'error', text: errorText })
        if (data.resetInMs) {
          setCooldown(Math.ceil(data.resetInMs / 1000))
        }
      }
    } catch (err) {
      console.error('[ResendVerificationCard] Network error:', err)
      setStatusMessage({ type: 'error', text: 'Network connection issue. Please check your internet and try again.' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="w-full bg-card border border-border rounded-xl p-4 sm:p-6 shadow-sm my-4">
      <div className="flex items-start gap-3">
        <div className="p-2.5 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
          <Mail className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-bold text-foreground">Didn&apos;t receive a verification email?</h4>
          <p className="text-xs text-muted-foreground mt-1">
            Check your spam or junk folder, or request another link below.
          </p>

          {statusMessage && (
            <div
              className={`mt-3 p-3 rounded-lg text-xs flex items-center gap-2 ${
                statusMessage.type === 'success'
                  ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20'
                  : 'bg-destructive/10 text-destructive border border-destructive/20'
              }`}
            >
              {statusMessage.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 shrink-0" />
              )}
              <span>{statusMessage.text}</span>
            </div>
          )}

          <div className="mt-4">
            <button
              type="button"
              onClick={handleResend}
              disabled={cooldown > 0 || loading}
              className="px-4 py-2 text-xs font-semibold rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2 min-h-[36px] cursor-pointer"
            >
              {loading ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Sending Verification Email...</span>
                </>
              ) : cooldown > 0 ? (
                <span>Resend Available in {cooldown}s</span>
              ) : (
                <>
                  <Mail className="w-3.5 h-3.5" />
                  <span>Resend Verification Email</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
