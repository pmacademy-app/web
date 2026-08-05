'use client'

import React, { useState } from 'react'
import { Terminal, Award, CheckCircle, AlertCircle, Loader2 } from 'lucide-react'

export interface DeveloperActionsProps {
  targetUserId: string
  targetUserEmail: string
}

export function DeveloperActionsSection({ targetUserId, targetUserEmail }: DeveloperActionsProps) {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{
    success: boolean
    certificateCode?: string
    verificationUrl?: string
    error?: string
  } | null>(null)

  const handleGenerateTestCertificate = async () => {
    if (!confirm(`Generate a TEST Certificate for ${targetUserEmail}? This will exercise the full certificate generation, notification, and email queue pipeline.`)) {
      return
    }

    setLoading(true)
    setResult(null)

    try {
      const res = await fetch('/api/admin/dev/generate-test-certificate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetUserId,
          type: 'full_curriculum',
        }),
      })

      const data = await res.json()
      if (res.ok && data.success) {
        setResult({
          success: true,
          certificateCode: data.certificateCode,
          verificationUrl: data.verificationUrl,
        })
      } else {
        setResult({
          success: false,
          error: data.error || 'Failed to generate test certificate',
        })
      }
    } catch (err) {
      setResult({
        success: false,
        error: err instanceof Error ? err.message : 'Network error',
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="p-5 rounded-xl bg-slate-900/90 border border-amber-500/30 space-y-4 shadow-xl">
      <div className="flex items-center justify-between border-b border-slate-800 pb-3">
        <div className="flex items-center gap-2 text-amber-400">
          <Terminal className="w-4 h-4" />
          <h3 className="font-bold text-xs uppercase tracking-wider">Developer & QA Testing Actions</h3>
        </div>
        <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20">
          Admin Only
        </span>
      </div>

      <p className="text-xs text-slate-400">
        Execute internal developer tools to verify certificate issuance, notification dispatching, and email queue integration. Intentionally bypasses learner eligibility requirements.
      </p>

      {/* Grid for developer tools - easily extensible for future actions */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <button
          onClick={handleGenerateTestCertificate}
          disabled={loading}
          className="flex items-center justify-between p-3 rounded-lg bg-slate-800/80 hover:bg-slate-800 text-slate-200 hover:text-white border border-slate-700 hover:border-amber-500/40 text-xs font-semibold transition-all disabled:opacity-50 text-left group"
        >
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">
              <Award className="w-4 h-4" />
            </div>
            <div>
              <p className="font-bold group-hover:text-amber-400 transition-colors">Generate Test Certificate</p>
              <p className="text-[10px] text-slate-400 font-normal">Triggers PDF, notification & email pipeline</p>
            </div>
          </div>
          {loading && <Loader2 className="w-4 h-4 text-amber-400 animate-spin" />}
        </button>

        {/* Future developer action placeholders */}
        <div className="p-3 rounded-lg bg-slate-950/40 border border-slate-800/60 text-slate-600 text-xs flex items-center justify-between opacity-50 cursor-not-allowed">
          <div>
            <p className="font-bold text-slate-500">Award Test XP / Level Up</p>
            <p className="text-[10px]">Future action placeholder</p>
          </div>
          <span className="text-[10px] uppercase font-mono">Future</span>
        </div>
      </div>

      {/* Action result notification */}
      {result && (
        <div className={`p-3 rounded-lg border text-xs ${result.success ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' : 'bg-rose-500/10 border-rose-500/30 text-rose-300'}`}>
          {result.success ? (
            <div className="space-y-1">
              <p className="font-bold flex items-center gap-1.5">
                <CheckCircle className="w-4 h-4 text-emerald-400" />
                Test Certificate Issued Successfully!
              </p>
              <p className="font-mono text-[11px]">Code: {result.certificateCode}</p>
              {result.verificationUrl && (
                <a href={result.verificationUrl} target="_blank" rel="noreferrer" className="text-amber-400 underline font-mono text-[11px] block">
                  Verify Link: {result.verificationUrl}
                </a>
              )}
            </div>
          ) : (
            <p className="font-bold flex items-center gap-1.5">
              <AlertCircle className="w-4 h-4 text-rose-400" />
              {result.error}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
