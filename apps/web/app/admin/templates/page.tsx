import React from 'react'
import { FileCode, CheckCircle, Send } from 'lucide-react'

export const revalidate = 0

const EMAIL_TEMPLATES = [
  { id: 'tpl-1', key: 'auth.welcome', name: 'Welcome & Getting Started', category: 'Auth / Transactional', priority: 'High (2)' },
  { id: 'tpl-2', key: 'auth.verify_email', name: 'Verify Email Address', category: 'Auth / Security', priority: 'Critical (1)' },
  { id: 'tpl-3', key: 'auth.password_reset', name: 'Password Reset Request', category: 'Auth / Security', priority: 'Critical (1)' },
  { id: 'tpl-4', key: 'learning.module_complete', name: 'Module Completion Award', category: 'Major Milestone', priority: 'High (2)' },
  { id: 'tpl-5', key: 'certificate.generated', name: 'Certificate Signed & Issued', category: 'Major Milestone', priority: 'High (2)' },
  { id: 'tpl-6', key: 'portfolio.published', name: 'Portfolio Published Alert', category: 'Major Milestone', priority: 'High (2)' },
  { id: 'tpl-7', key: 'system.weekly_recap', name: 'Weekly Learning Summary', category: 'Scheduled Digest', priority: 'Medium (5)' },
  { id: 'tpl-8', key: 'system.product_announcement', name: 'Admin Product Announcement', category: 'Admin Broadcast', priority: 'Bulk (10)' },
]

export default async function AdminTemplatesPage() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
            <FileCode className="w-6 h-6 text-amber-400" />
            Email Template Registry
          </h1>
          <p className="text-sm text-slate-400">View registered React Email templates, default priorities, and send test previews.</p>
        </div>
      </div>

      <div className="bg-slate-900/60 border border-slate-800 rounded-xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-950/80 text-slate-400 uppercase tracking-wider text-[10px] font-bold border-b border-slate-800">
              <tr>
                <th className="px-5 py-3.5">Template Key</th>
                <th className="px-5 py-3.5">Template Name</th>
                <th className="px-5 py-3.5">Category</th>
                <th className="px-5 py-3.5">Priority</th>
                <th className="px-5 py-3.5">Status</th>
                <th className="px-5 py-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-medium">
              {EMAIL_TEMPLATES.map((tpl) => (
                <tr key={tpl.id} className="hover:bg-slate-800/40 transition-colors">
                  <td className="px-5 py-4 font-mono text-amber-400 font-semibold">{tpl.key}</td>
                  <td className="px-5 py-4 text-white font-bold">{tpl.name}</td>
                  <td className="px-5 py-4 text-slate-400">{tpl.category}</td>
                  <td className="px-5 py-4">
                    <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-mono text-[10px] border border-slate-700">
                      {tpl.priority}
                    </span>
                  </td>
                  <td className="px-5 py-4">
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                      <CheckCircle className="w-3 h-3" /> Active (v1)
                    </span>
                  </td>
                  <td className="px-5 py-4 text-right">
                    <button className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] font-semibold border border-slate-700 transition-colors inline-flex items-center gap-1">
                      <Send className="w-3 h-3 text-amber-400" /> Send Test
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
