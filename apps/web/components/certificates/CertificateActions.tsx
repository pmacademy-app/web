'use client'

import React, { useState } from 'react'
import Link from 'next/link'
import { Printer, Copy, Check, Share2, ExternalLink } from 'lucide-react'

interface CertificateActionsProps {
  verificationUrl: string
  portfolioUrl: string
  certificateCode: string
}

export function CertificateActions({
  verificationUrl,
  portfolioUrl,
  certificateCode,
}: CertificateActionsProps) {
  const [copied, setCopied] = useState<boolean>(false)

  const handlePrint = () => {
    if (typeof window !== 'undefined') {
      window.print()
    }
  }

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(verificationUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    } catch {
      console.warn('Clipboard copy failed.')
    }
  }

  const handleShare = async () => {
    if (typeof navigator !== 'undefined' && 'share' in navigator && typeof navigator.share === 'function') {
      try {
        await navigator.share({
          title: `PM Academy Certificate ${certificateCode}`,
          text: `Verify my official Product Management Completion Credential on PM Academy!`,
          url: verificationUrl,
        })
        return
      } catch {
        // Fallback
      }
    }
    handleCopyLink()
  }

  const hasNativeShare = typeof navigator !== 'undefined' && 'share' in navigator

  return (
    <div className="no-print flex flex-wrap items-center justify-between gap-4 p-4 rounded-xl border border-border bg-card/60 shadow-xs">
      {/* Left: Print & Download PDF */}
      <div className="flex items-center gap-2 flex-wrap">
        <button
          type="button"
          onClick={handlePrint}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 font-bold text-xs shadow-sm transition-all active:scale-95"
        >
          <Printer className="w-4 h-4" />
          <span>Print / Download PDF</span>
        </button>

        <button
          type="button"
          onClick={handleShare}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-border bg-background hover:bg-secondary text-foreground font-bold text-xs transition-colors"
        >
          <Share2 className="w-4 h-4 text-primary" />
          <span>{hasNativeShare ? 'Share Certificate' : 'Share'}</span>
        </button>
      </div>

      {/* Right: Copy Link & View Portfolio */}
      <div className="flex items-center gap-3 flex-wrap">
        <button
          type="button"
          onClick={handleCopyLink}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
        >
          {copied ? (
            <>
              <Check className="w-3.5 h-3.5 text-emerald-500" />
              <span className="text-emerald-500 font-bold">Verification Link Copied!</span>
            </>
          ) : (
            <>
              <Copy className="w-3.5 h-3.5" />
              <span>Copy Verification Link</span>
            </>
          )}
        </button>

        <Link
          href={portfolioUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-xs font-bold text-primary hover:underline border-l border-border/80 pl-3"
        >
          <span>View Public Portfolio</span>
          <ExternalLink className="w-3.5 h-3.5" />
        </Link>
      </div>
    </div>
  )
}
