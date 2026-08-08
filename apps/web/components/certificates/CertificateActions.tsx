'use client'

import React, { useState } from 'react'
import Link from 'next/link'
import { Printer, Copy, Check, Share2, ExternalLink } from 'lucide-react'
import { buildLinkedInCertificationUrl } from '@/lib/certificates/linkedin-url'

interface CertificateActionsProps {
  verificationUrl: string
  portfolioUrl: string
  certificateCode: string
  careerTitle?: string
  type?: string
  issuedAt?: string | Date
}

function LinkedInIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M19 3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14m-.5 15.5v-5.3a3.26 3.26 0 0 0-3.26-3.26c-.85 0-1.84.52-2.28 1.3v-1.11h-2.79v8.37h2.79v-4.93c0-.77.62-1.4 1.39-1.4a1.4 1.4 0 0 1 1.4 1.4v4.93h2.75M6.46 10.9v8.37H9.25V10.9H6.46M7.86 6.78a1.64 1.64 0 1 0 0 3.28 1.64 1.64 0 0 0 0-3.28z" />
    </svg>
  )
}

export function CertificateActions({
  verificationUrl,
  portfolioUrl,
  certificateCode,
  careerTitle,
  type = 'full_curriculum',
  issuedAt,
}: CertificateActionsProps) {
  const [copied, setCopied] = useState<boolean>(false)

  const linkedInUrl = buildLinkedInCertificationUrl({
    certificateCode,
    careerTitle,
    type,
    issuedAt,
    verificationUrl,
  })

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
    <div className="no-print flex flex-wrap items-center justify-between gap-4 p-4 rounded-2xl border border-border bg-card/80 shadow-xs">
      {/* Left: Print & LinkedIn Add-to-Profile */}
      <div className="flex items-center gap-2.5 flex-wrap">
        <button
          type="button"
          onClick={handlePrint}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 font-bold text-xs shadow-xs transition-all active:scale-95 cursor-pointer"
        >
          <Printer className="w-4 h-4" />
          <span>Print / Download PDF</span>
        </button>

        {/* Add to LinkedIn Profile Button */}
        <a
          href={linkedInUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-sky-600/30 bg-sky-500/10 hover:bg-sky-500/20 text-sky-600 dark:text-sky-400 font-bold text-xs transition-all active:scale-95 shadow-xs"
          title="Add this official certificate directly to your LinkedIn profile"
        >
          <LinkedInIcon className="w-4 h-4 text-sky-600 dark:text-sky-400" />
          <span>Add to LinkedIn Profile</span>
        </a>
      </div>

      {/* Right: Share, Copy Link & View Portfolio */}
      <div className="flex items-center gap-3 flex-wrap">
        <button
          type="button"
          onClick={handleShare}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-border bg-background hover:bg-secondary text-foreground font-bold text-xs transition-colors cursor-pointer"
        >
          <Share2 className="w-3.5 h-3.5 text-primary" />
          <span>{hasNativeShare ? 'Share Certificate' : 'Share'}</span>
        </button>

        <button
          type="button"
          onClick={handleCopyLink}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
        >
          {copied ? (
            <>
              <Check className="w-3.5 h-3.5 text-emerald-500" />
              <span className="text-emerald-500 font-bold">Link Copied!</span>
            </>
          ) : (
            <>
              <Copy className="w-3.5 h-3.5" />
              <span>Copy Link</span>
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
