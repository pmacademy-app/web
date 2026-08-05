import React from 'react'
import { Briefcase, Globe } from 'lucide-react'
import { createServerSupabaseClient } from '@/lib/supabase'

export const revalidate = 0

export default async function AdminPortfoliosPage() {
  const supabase = createServerSupabaseClient()
  const { data: users } = await supabase
    .from('users')
    .select('id, email, full_name, is_portfolio_public, username, updated_at')
    .eq('is_portfolio_public', true)
    .limit(30)

  const portfolioUsers = (users || []) as unknown as Array<{
    id: string
    email: string
    full_name?: string
    username?: string
    updated_at?: string
  }>

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
            <Briefcase className="w-6 h-6 text-amber-400" />
            Public Portfolios Audit
          </h1>
          <p className="text-sm text-slate-400">View published learner portfolios (`/p/[username]`) and public artifacts.</p>
        </div>
      </div>

      <div className="bg-slate-900/60 border border-slate-800 rounded-xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-950/80 text-slate-400 uppercase tracking-wider text-[10px] font-bold border-b border-slate-800">
              <tr>
                <th className="px-5 py-3.5">Learner</th>
                <th className="px-5 py-3.5">Username Handle</th>
                <th className="px-5 py-3.5">Visibility</th>
                <th className="px-5 py-3.5 text-right">Portfolio Link</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-medium">
              {portfolioUsers.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-5 py-8 text-center text-slate-500">
                    No public portfolios published yet.
                  </td>
                </tr>
              ) : (
                portfolioUsers.map((u) => (
                  <tr key={u.id} className="hover:bg-slate-800/40 transition-colors">
                    <td className="px-5 py-4 font-bold text-white">{u.full_name || u.email}</td>
                    <td className="px-5 py-4 font-mono text-amber-400">@{u.username || u.id.slice(0, 8)}</td>
                    <td className="px-5 py-4">
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                        <Globe className="w-3 h-3" /> Public
                      </span>
                    </td>
                    <td className="px-5 py-4 text-right font-mono text-xs text-blue-400">
                      /p/{u.username || u.id.slice(0, 8)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
