'use client'

import React, { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ShieldCheck, Lock, Mail, Loader2, ArrowRight } from 'lucide-react'
import { createBrowserSupabaseClient } from '@/lib/supabase'
import { BRAND } from '@/lib/brand'
import { classifyAuthError } from '@/lib/auth/errors'
import { recordAuthTelemetry } from '@/lib/auth/telemetry'

/**
 * Admin Console login.
 *
 * This app has a SINGLE authentication system: this page authenticates the
 * user with the same Supabase account used for the learner side. After
 * authentication, authorization (ADMIN_EMAILS OR users.is_admin) is verified
 * server-side before routing:
 *   - authorized  -> /admin
 *   - unauthorized-> /admin/access-denied
 *
 * Session cookies are persisted via /api/auth/session so tokens stay
 * httpOnly (never exposed to document.cookie / XSS).
 */
export default function AdminLoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleAdminLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const supabase = createBrowserSupabaseClient()
      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (authError || !data.session) {
        const classified = classifyAuthError(authError || new Error('Invalid credentials'), 'admin_login')
        setError(classified.message)
        recordAuthTelemetry(classified, 'login')
        setLoading(false)
        return
      }

      // Persist the session as httpOnly server-side cookies so the middleware
      // and server components can verify the request.
      const syncRes = await fetch('/api/auth/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session: data.session }),
      })

      if (!syncRes.ok) {
        const syncError = classifyAuthError(new Error('Session sync failed'), 'session_sync')
        setError(syncError.message)
        recordAuthTelemetry(syncError, 'session_sync')
        setLoading(false)
        return
      }

      // Verify authorization before entering the console. This endpoint runs
      // the server-side RBAC guard (ADMIN_EMAILS OR users.is_admin).
      let authorized = false
      try {
        const verifyRes = await fetch('/api/admin/verify')
        const verifyData = (await verifyRes.json()) as { authorized?: boolean }
        authorized = Boolean(verifyData.authorized)
      } catch {
        // Fall back to middleware routing if the verification call fails.
        authorized = false
      }

      router.push(authorized ? '/admin' : '/admin/access-denied')
      router.refresh()
    } catch (err) {
      const classified = classifyAuthError(err, 'admin_login')
      setError(classified.message)
      recordAuthTelemetry(classified, 'login')
      setLoading(false)
    }
  }

  return (
    <div className="admin-console min-h-screen bg-admin-bg text-admin-fg flex items-center justify-center p-4 antialiased selection:bg-admin-accent/30 selection:text-admin-accent">
      <div className="max-w-md w-full p-8 rounded-2xl bg-admin-surface border border-admin-border space-y-6 shadow-2xl backdrop-blur">
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="w-12 h-12 rounded-xl bg-admin-accent/20 text-admin-accent border border-admin-accent/30 flex items-center justify-center font-bold mx-auto shadow-inner">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <h1 className="text-2xl font-bold text-admin-fg tracking-tight">{BRAND.fullName}</h1>
          <p className="text-xs font-semibold text-admin-accent uppercase tracking-wider">Operational Control Center Login</p>
        </div>

        {/* Login Form */}
        <form onSubmit={handleAdminLogin} className="space-y-4">
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-admin-fg-muted">Admin Email Address</label>
            <div className="relative">
              <Mail className="w-4 h-4 text-admin-fg-subtle absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@prodily.adityagangwani.me"
                className="w-full pl-9 pr-4 py-2.5 bg-admin-bg border border-admin-border rounded-xl text-xs text-admin-fg placeholder-admin-fg-subtle focus:outline-none focus:border-admin-accent/50 focus:ring-1 focus:ring-admin-accent/30 transition-all"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-admin-fg-muted">Account Password</label>
            <div className="relative">
              <Lock className="w-4 h-4 text-admin-fg-subtle absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                className="w-full pl-9 pr-4 py-2.5 bg-admin-bg border border-admin-border rounded-xl text-xs text-admin-fg placeholder-admin-fg-subtle focus:outline-none focus:border-admin-accent/50 focus:ring-1 focus:ring-admin-accent/30 transition-all"
              />
            </div>
          </div>

          {error && (
            <div className="p-3 rounded-xl bg-admin-danger/10 border border-admin-danger/25 text-admin-danger text-xs font-medium">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 px-4 rounded-xl bg-admin-accent hover:bg-admin-accent/90 text-admin-accent-fg font-bold text-xs transition-colors flex items-center justify-center gap-2 shadow-lg disabled:opacity-50"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <><span>Sign In to Admin Console</span> <ArrowRight className="w-4 h-4" /></>}
          </button>
        </form>

        <div className="text-center pt-2 border-t border-admin-border/80">
          <Link href="/login" className="text-xs text-admin-fg-muted hover:text-admin-fg transition-colors">
            Learner Login →
          </Link>
        </div>
      </div>
    </div>
  )
}
