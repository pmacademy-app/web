'use client'

import React from 'react'
import { useRouter } from 'next/navigation'
import { ShieldCheck, Activity, LogOut, Menu } from 'lucide-react'
import { createBrowserSupabaseClient } from '@/lib/supabase'

interface AdminHeaderProps {
  onToggleMobileMenu?: () => void
}

export function AdminHeader({ onToggleMobileMenu }: AdminHeaderProps = {}) {
  const router = useRouter()

  const handleSignOut = async () => {
    try {
      const supabase = createBrowserSupabaseClient()
      await supabase.auth.signOut()

      // Clear server-side session cookies
      await fetch('/api/auth/session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ session: null }),
      })

      router.push('/admin/login')
      router.refresh()
    } catch (err) {
      console.error('[AdminHeader] Sign out error:', err)
    }
  }

  return (
    <header className="h-16 bg-slate-900/80 backdrop-blur border-b border-slate-800 px-4 sm:px-6 flex items-center justify-between sticky top-0 z-30">
      <div className="flex items-center gap-3">
        {onToggleMobileMenu && (
          <button
            type="button"
            onClick={onToggleMobileMenu}
            aria-label="Open admin navigation menu"
            className="md:hidden p-1.5 rounded-lg border border-slate-700 bg-slate-800 text-slate-300 hover:text-white transition-colors"
          >
            <Menu className="w-4 h-4" />
          </button>
        )}
        <span className="flex h-2 w-2 relative">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
        </span>
        <span className="text-xs font-mono text-emerald-400 font-medium">System Online</span>
      </div>

      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-800 border border-slate-700 text-xs text-slate-300">
          <ShieldCheck className="w-3.5 h-3.5 text-amber-400" />
          <span className="font-semibold text-slate-200">Admin Mode Active</span>
        </div>
        <div className="hidden lg:flex items-center gap-2 text-xs text-slate-400">
          <Activity className="w-3.5 h-3.5 text-slate-500" />
          <span>Next.js 16 App Router</span>
        </div>
        <button
          type="button"
          onClick={handleSignOut}
          aria-label="Sign out of Admin Console"
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-xs font-semibold text-rose-300 hover:text-rose-200 hover:bg-rose-500/10 transition-colors cursor-pointer"
        >
          <LogOut className="w-3.5 h-3.5" />
          <span>Sign Out</span>
        </button>
      </div>
    </header>
  )
}
