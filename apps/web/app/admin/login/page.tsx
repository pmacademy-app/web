'use client'

import React, { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ShieldCheck, Lock, Mail, Loader2, ArrowRight } from 'lucide-react'
import { createBrowserSupabaseClient } from '@/lib/supabase'

/**
 * Admin Console login.
 *
 * PM Academy has a SINGLE authentication system: this page authenticates the
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
        setError(authError?.message || 'Invalid admin credentials')
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
        setError('Failed to persist your session. Please try again.')
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
    } catch {
      setError('An error occurred during authentication')
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4 antialiased selection:bg-amber-500/30 selection:text-amber-200">
      <div className="max-w-md w-full p-8 rounded-2xl bg-slate-900/90 border border-slate-800 space-y-6 shadow-2xl backdrop-blur">
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="w-12 h-12 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center justify-center font-bold mx-auto shadow-inner">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">PM Academy</h1>
          <p className="text-xs font-semibold text-amber-400 uppercase tracking-wider">Operational Control Center Login</p>
        </div>

        {/* Login Form */}
        <form onSubmit={handleAdminLogin} className="space-y-4">
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-slate-300">Admin Email Address</label>
            <div className="relative">
              <Mail className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@pmacademy.com"
                className="w-full pl-9 pr-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/30 transition-all"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-slate-300">Account Password</label>
            <div className="relative">
              <Lock className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                className="w-full pl-9 pr-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/30 transition-all"
              />
            </div>
          </div>

          {error && (
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/25 text-rose-400 text-xs font-medium">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 px-4 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs transition-colors flex items-center justify-center gap-2 shadow-lg disabled:opacity-50"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <><span>Sign In to Admin Console</span> <ArrowRight className="w-4 h-4" /></>}
          </button>
        </form>

        <div className="text-center pt-2 border-t border-slate-800/80">
          <Link href="/login" className="text-xs text-slate-400 hover:text-slate-200 transition-colors">
            Learner Login →
          </Link>
        </div>
      </div>
    </div>
  )
}
