'use client'

import React, { useState } from 'react'
import { SendTestEmailButton } from './SendTestEmailButton'
import { SendProductionEmailModal } from './SendProductionEmailModal'
import { Terminal, Award, CheckCircle, AlertCircle, Loader2, Send } from 'lucide-react'

export interface DeveloperActionsProps {
  targetUserId: string
  targetUserEmail: string
}

export function DeveloperActionsSection({ targetUserId, targetUserEmail }: DeveloperActionsProps) {
  const [prodModalOpen, setProdModalOpen] = useState(false)
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
    <div className="p-5 rounded-xl bg-admin-surface border border-admin-accent/25 space-y-4 shadow-xl">
      <div className="flex items-center justify-between border-b border-admin-border pb-3">
        <div className="flex items-center gap-2 text-admin-accent">
          <Terminal className="w-4 h-4" />
          <h3 className="font-bold text-xs uppercase tracking-wider">Developer & QA Testing Actions</h3>
        </div>
        <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-admin-accent-soft text-admin-accent border border-admin-accent/25">
          Admin Only
        </span>
      </div>

      <p className="text-xs text-admin-fg-muted">
        Execute internal developer tools to verify certificate issuance, notification dispatching, and email queue integration. Intentionally bypasses learner eligibility requirements.
      </p>

      {/* Grid for developer tools - easily extensible for future actions */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <button
          onClick={handleGenerateTestCertificate}
          disabled={loading}
          className="flex items-center justify-between p-3 rounded-lg bg-admin-surface-raised hover:bg-admin-surface-raised/80 text-admin-fg hover:text-admin-fg border border-admin-border hover:border-admin-accent/40 text-xs font-semibold transition-all disabled:opacity-50 text-left group"
        >
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded bg-admin-accent-soft text-admin-accent border border-admin-accent/25">
              <Award className="w-4 h-4" />
            </div>
            <div>
              <p className="font-bold group-hover:text-admin-accent transition-colors">Generate Test Certificate</p>
              <p className="text-[10px] text-admin-fg-muted font-normal">Triggers PDF, notification & email pipeline</p>
            </div>
          </div>
          {loading && <Loader2 className="w-4 h-4 text-admin-accent animate-spin" />}
        </button>

        <SendTestEmailButton
          templateKey="auth.welcome"
          templateName="Auth Welcome Email"
        />

        <button
          type="button"
          onClick={() => setProdModalOpen(true)}
          className="flex items-center justify-between p-3 rounded-lg bg-admin-success-soft hover:bg-admin-success/20 text-admin-success border border-admin-success/25 text-xs font-semibold transition-all text-left group cursor-pointer col-span-1 md:col-span-2"
        >
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded bg-admin-success/20 text-admin-success border border-admin-success/25">
              <Send className="w-4 h-4" />
            </div>
            <div>
              <p className="font-bold group-hover:text-admin-success transition-colors">Send Production Email</p>
              <p className="text-[10px] text-admin-success/80 font-normal">Dispatches real production template to {targetUserEmail}</p>
            </div>
          </div>
          <span className="px-2 py-0.5 rounded text-[9px] uppercase tracking-wider font-extrabold bg-admin-success/20 text-admin-success border border-admin-success/25">
            Production
          </span>
        </button>
      </div>

      <SendProductionEmailModal
        isOpen={prodModalOpen}
        onClose={() => setProdModalOpen(false)}
        targetUser={{ id: targetUserId, name: targetUserEmail.split('@')[0], email: targetUserEmail }}
      />

      {/* Action result notification */}
      {result && (
        <div className={`p-3 rounded-lg border text-xs ${result.success ? 'bg-admin-success-soft border-admin-success/25 text-admin-success' : 'bg-admin-danger-soft border-admin-danger/25 text-admin-danger'}`}>
          {result.success ? (
            <div className="space-y-1">
              <p className="font-bold flex items-center gap-1.5">
                <CheckCircle className="w-4 h-4 text-admin-success" />
                Test Certificate Issued Successfully!
              </p>
              <p className="font-mono text-[11px]">Code: {result.certificateCode}</p>
              {result.verificationUrl && (
                <a href={result.verificationUrl} target="_blank" rel="noreferrer" className="text-admin-accent underline font-mono text-[11px] block">
                  Verify Link: {result.verificationUrl}
                </a>
              )}
            </div>
          ) : (
            <p className="font-bold flex items-center gap-1.5">
              <AlertCircle className="w-4 h-4 text-admin-danger" />
              {result.error}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
