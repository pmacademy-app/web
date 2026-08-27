'use client'

import { useState } from 'react'
import { Copy, Check, X, Share2, MessageCircle } from 'lucide-react'
import { trackReferralLinkCopied, trackReferralShared } from '@/lib/analytics'
import { BRAND } from '@/lib/brand'

function LinkedInIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M19 3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14m-.5 15.5v-5.3a3.26 3.26 0 0 0-3.26-3.26c-.85 0-1.84.52-2.28 1.3v-1.11h-2.79v8.37h2.79v-4.93c0-.77.62-1.4 1.39-1.4a1.4 1.4 0 0 1 1.4 1.4v4.93h2.75M6.46 10.9v8.37H9.25V10.9H6.46M7.86 6.74a1.64 1.64 0 1 0 0 3.28 1.64 1.64 0 0 0 0-3.28Z" />
    </svg>
  )
}

function TwitterIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  )
}

interface ReferralShareModalProps {
  isOpen: boolean
  onClose: () => void
  referralLink: string
}

export function ReferralShareModal({
  isOpen,
  onClose,
  referralLink,
}: ReferralShareModalProps) {
  const [copied, setCopied] = useState(false)

  if (!isOpen) return null

  const shareText = `Master Product Management for free with ${BRAND.product}! 90 practical lessons, interactive quizzes, and real-world capstones.`

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(referralLink)
      setCopied(true)
      trackReferralLinkCopied('modal')
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Fallback
    }
  }

  const handleSocialShare = (platform: 'linkedin' | 'twitter' | 'whatsapp') => {
    trackReferralShared(platform)
    let url = ''

    if (platform === 'linkedin') {
      url = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(referralLink)}`
    } else if (platform === 'twitter') {
      url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(referralLink)}`
    } else if (platform === 'whatsapp') {
      url = `https://api.whatsapp.com/send?text=${encodeURIComponent(`${shareText} ${referralLink}`)}`
    }

    if (url) {
      window.open(url, '_blank', 'noopener,noreferrer,width=600,height=500')
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-xs animate-fade-in">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-xl space-y-6 animate-scale-in relative">
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 text-muted-foreground hover:text-foreground p-1 rounded-lg transition-colors cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="space-y-2">
          <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
            <Share2 className="w-5 h-5" />
          </div>
          <h3 className="text-xl font-bold font-serif text-foreground">
            Invite Peers to {BRAND.product}
          </h3>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Share your unique invite link with friends and colleagues. When they join and finish their first lesson, you earn +50 XP!
          </p>
        </div>

        {/* Copyable Link Box */}
        <div className="space-y-2">
          <label className="text-xs font-semibold text-foreground">Your Personal Referral Link</label>
          <div className="flex items-center gap-2 p-2 rounded-xl border border-border bg-secondary/30">
            <input
              type="text"
              readOnly
              value={referralLink}
              className="flex-1 bg-transparent text-xs font-mono text-foreground focus:outline-hidden px-1 select-all"
            />
            <button
              type="button"
              onClick={handleCopy}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-bold hover:bg-primary/90 transition-all cursor-pointer shrink-0"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  Copied!
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  Copy
                </>
              )}
            </button>
          </div>
        </div>

        {/* Social Share Buttons */}
        <div className="space-y-2">
          <label className="text-xs font-semibold text-foreground">Quick Share to Socials</label>
          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => handleSocialShare('linkedin')}
              className="flex items-center justify-center gap-2 p-2.5 rounded-xl border border-border bg-card/60 hover:bg-[#0A66C2]/10 hover:border-[#0A66C2]/30 text-xs font-semibold text-foreground hover:text-[#0A66C2] transition-all cursor-pointer"
            >
              <LinkedInIcon className="w-4 h-4 text-[#0A66C2]" />
              LinkedIn
            </button>

            <button
              type="button"
              onClick={() => handleSocialShare('twitter')}
              className="flex items-center justify-center gap-2 p-2.5 rounded-xl border border-border bg-card/60 hover:bg-foreground/10 hover:border-foreground/30 text-xs font-semibold text-foreground transition-all cursor-pointer"
            >
              <TwitterIcon className="w-4 h-4" />
              X / Twitter
            </button>

            <button
              type="button"
              onClick={() => handleSocialShare('whatsapp')}
              className="flex items-center justify-center gap-2 p-2.5 rounded-xl border border-border bg-card/60 hover:bg-[#25D366]/10 hover:border-[#25D366]/30 text-xs font-semibold text-foreground hover:text-[#25D366] transition-all cursor-pointer"
            >
              <MessageCircle className="w-4 h-4 text-[#25D366]" />
              WhatsApp
            </button>
          </div>
        </div>

        <div className="pt-2 border-t border-border flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl border border-border text-xs font-bold text-foreground hover:bg-secondary/60 transition-colors cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  )
}
