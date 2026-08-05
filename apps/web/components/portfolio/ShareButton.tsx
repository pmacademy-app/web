'use client'

import React, { useState } from 'react'
import { Share2, Copy, Check } from 'lucide-react'

interface ShareButtonProps {
  username: string
}

export function ShareButton({ username }: ShareButtonProps) {
  const [copied, setCopied] = useState<boolean>(false)

  const handleShare = async () => {
    const origin = typeof window !== 'undefined' ? window.location.origin : ''
    const shareUrl = `${origin}/p/${encodeURIComponent(username)}`

    // Attempt Native Share API first
    if (typeof navigator !== 'undefined' && 'share' in navigator && typeof navigator.share === 'function') {
      try {
        await navigator.share({
          title: `${username}'s PM Academy Portfolio`,
          text: `Check out ${username}'s Product Management portfolio and skill radar on PM Academy!`,
          url: shareUrl,
        })
        return
      } catch {
        // Fallback to copy clipboard if user canceled or rejected
      }
    }

    // Fallback: Copy to clipboard
    try {
      await navigator.clipboard.writeText(shareUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    } catch {
      console.warn('Clipboard copy failed.')
    }
  }

  const hasNativeShare = typeof navigator !== 'undefined' && 'share' in navigator

  return (
    <button
      type="button"
      onClick={handleShare}
      className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 font-bold text-xs shadow-sm transition-all active:scale-95"
      aria-label="Share Portfolio"
    >
      {copied ? (
        <>
          <Check className="w-4 h-4 text-emerald-300" />
          <span>Link Copied!</span>
        </>
      ) : (
        <>
          {hasNativeShare ? (
            <Share2 className="w-4 h-4" />
          ) : (
            <Copy className="w-4 h-4" />
          )}
          <span>Share Portfolio</span>
        </>
      )}
    </button>
  )
}
