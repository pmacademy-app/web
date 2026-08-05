import React from 'react'
import { Award } from 'lucide-react'
import { createServerSupabaseClient } from '@/lib/supabase'

export const revalidate = 0

export default async function AdminCertificatesPage() {
  const supabase = createServerSupabaseClient()
  const { data: certs } = await supabase
    .from('user_certificates')
    .select('*')
    .order('issued_at', { ascending: false })
    .limit(30)

  const certList = (certs || []) as unknown as Array<{
    id: string
    certificate_code: string
    user_id: string
    certificate_type: string
    module_slug?: string
    issued_at: string
  }>

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
            <Award className="w-6 h-6 text-amber-400" />
            Certificate Audit & Credentials
          </h1>
          <p className="text-sm text-slate-400">View issued certificates, verification codes, and credential links.</p>
        </div>
      </div>

      <div className="bg-slate-900/60 border border-slate-800 rounded-xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-950/80 text-slate-400 uppercase tracking-wider text-[10px] font-bold border-b border-slate-800">
              <tr>
                <th className="px-5 py-3.5">Certificate Code</th>
                <th className="px-5 py-3.5">Type</th>
                <th className="px-5 py-3.5">Issued At</th>
                <th className="px-5 py-3.5 text-right">Verification URL</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-medium">
              {certList.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-5 py-8 text-center text-slate-500">
                    No issued certificates recorded yet.
                  </td>
                </tr>
              ) : (
                certList.map((cert) => (
                  <tr key={cert.id} className="hover:bg-slate-800/40 transition-colors">
                    <td className="px-5 py-4 font-mono font-bold text-amber-400">{cert.certificate_code}</td>
                    <td className="px-5 py-4 text-slate-300 capitalize">{cert.certificate_type.replace('_', ' ')}</td>
                    <td className="px-5 py-4 text-slate-400 font-mono text-[11px]">{new Date(cert.issued_at).toLocaleDateString()}</td>
                    <td className="px-5 py-4 text-right font-mono text-xs text-blue-400">/verify/{cert.id}</td>
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
