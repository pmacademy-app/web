'use client'

import { useEffect, useState } from 'react'
import {
  Gift,
  Copy,
  Check,
  Share2,
  Users,
  Award,
  Zap,
  MessageCircle,
} from 'lucide-react'
import { trackReferralLinkCopied, trackReferralShared } from '@/lib/analytics'
import { BRAND } from '@/lib/brand'
import { ReferralShareModal } from '@/components/referral/ReferralShareModal'
import type { UserReferralStats } from '@/lib/referral/referral-service'

function LinkedInIcon({ className = 'w-3.5 h-3.5' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M19 3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14m-.5 15.5v-5.3a3.26 3.26 0 0 0-3.26-3.26c-.85 0-1.84.52-2.28 1.3v-1.11h-2.79v8.37h2.79v-4.93c0-.77.62-1.4 1.39-1.4a1.4 1.4 0 0 1 1.4 1.4v4.93h2.75M6.46 10.9v8.37H9.25V10.9H6.46M7.86 6.74a1.64 1.64 0 1 0 0 3.28 1.64 1.64 0 0 0 0-3.28Z" />
    </svg>
  )
}

function TwitterIcon({ className = 'w-3.5 h-3.5' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  )
}

export function ReferralSettingsTab() {
  const [stats, setStats] = useState<UserReferralStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState(false)
  const [isShareModalOpen, setIsShareModalOpen] = useState(false)

  useEffect(() => {
    let isMounted = true
    async function loadStats() {
      try {
        const res = await fetch('/api/referrals')
        if (!res.ok) return
        const data = await res.json()
        if (data?.success && data.stats && isMounted) {
          setStats(data.stats)
        }
      } catch (err) {
        console.warn('[ReferralSettingsTab] Failed to load stats:', err)
      } finally {
        if (isMounted) setLoading(false)
      }
    }

    loadStats()
    return () => {
      isMounted = false
    }
  }, [])

  const referralLink = stats?.referralLink || `${typeof window !== 'undefined' ? window.location.origin : ''}/signup`
  const referralCode = stats?.referralCode || ''

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(referralLink)
      setCopied(true)
      trackReferralLinkCopied('settings_tab')
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Fallback
    }
  }

  const handleSocialShare = (platform: 'linkedin' | 'twitter' | 'whatsapp') => {
    trackReferralShared(platform)
    const shareText = `Master Product Management for free with ${BRAND.product}! 90 practical lessons, interactive quizzes, and real-world capstones.`
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
    <div className="space-y-6 animate-fade-in">
      {/* Hero Banner Card */}
      <div className="p-6 rounded-2xl border border-primary/20 bg-linear-to-br from-primary/10 via-card to-card space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-2xl bg-primary/20 text-primary flex items-center justify-center shrink-0">
              <Gift className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <h2 className="text-xl font-bold font-serif text-foreground">
                Invite Peers & Earn XP
              </h2>
              <p className="text-xs text-muted-foreground max-w-lg leading-relaxed">
                Invite fellow aspiring product managers and colleagues to {BRAND.product}. When they complete their first lesson, you earn <strong className="text-primary font-semibold">+50 XP</strong>!
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setIsShareModalOpen(true)}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-xs font-bold shadow hover:bg-primary/95 transition-all cursor-pointer shrink-0"
          >
            <Share2 className="w-4 h-4" />
            Share Link
          </button>
        </div>

        {/* Copy Link Input Bar */}
        <div className="space-y-2 pt-2 border-t border-border/60">
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold text-foreground">Your Personal Referral Link</label>
            <span className="text-[11px] text-muted-foreground font-mono">Code: {referralCode}</span>
          </div>

          <div className="flex items-center gap-2 p-2 rounded-xl border border-border bg-secondary/40">
            <input
              type="text"
              readOnly
              value={referralLink}
              className="flex-1 bg-transparent text-xs font-mono text-foreground focus:outline-hidden px-2 select-all overflow-hidden text-ellipsis"
            />
            <button
              type="button"
              onClick={handleCopyLink}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-card border border-border text-foreground text-xs font-semibold hover:bg-accent/50 transition-all cursor-pointer shrink-0"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-500" />
                  Copied!
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5 text-primary" />
                  Copy Link
                </>
              )}
            </button>
          </div>
        </div>

        {/* Quick Share Buttons */}
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <span className="text-xs text-muted-foreground mr-1">Direct Share:</span>
          <button
            type="button"
            onClick={() => handleSocialShare('linkedin')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-card hover:bg-[#0A66C2]/10 hover:border-[#0A66C2]/30 text-xs font-semibold text-foreground hover:text-[#0A66C2] transition-colors cursor-pointer"
          >
            <LinkedInIcon className="w-3.5 h-3.5 text-[#0A66C2]" />
            LinkedIn
          </button>
          <button
            type="button"
            onClick={() => handleSocialShare('twitter')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-card hover:bg-foreground/10 hover:border-foreground/30 text-xs font-semibold text-foreground transition-colors cursor-pointer"
          >
            <TwitterIcon className="w-3.5 h-3.5" />
            X / Twitter
          </button>
          <button
            type="button"
            onClick={() => handleSocialShare('whatsapp')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-card hover:bg-[#25D366]/10 hover:border-[#25D366]/30 text-xs font-semibold text-foreground hover:text-[#25D366] transition-colors cursor-pointer"
          >
            <MessageCircle className="w-3.5 h-3.5 text-[#25D366]" />
            WhatsApp
          </button>
        </div>
      </div>

      {/* KPI Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-4 rounded-xl border border-border bg-card flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <div className="text-2xl font-bold font-serif text-foreground">
              {loading ? '-' : stats?.totalInvited ?? 0}
            </div>
            <div className="text-xs text-muted-foreground font-medium">Learners Invited</div>
          </div>
        </div>

        <div className="p-4 rounded-xl border border-border bg-card flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
            <Award className="w-5 h-5" />
          </div>
          <div>
            <div className="text-2xl font-bold font-serif text-foreground">
              {loading ? '-' : stats?.activatedCount ?? 0}
            </div>
            <div className="text-xs text-muted-foreground font-medium">Activated (1st Lesson Done)</div>
          </div>
        </div>

        <div className="p-4 rounded-xl border border-border bg-card flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
            <Zap className="w-5 h-5" />
          </div>
          <div>
            <div className="text-2xl font-bold font-serif text-foreground">
              {loading ? '-' : `+${stats?.totalXpEarned ?? 0} XP`}
            </div>
            <div className="text-xs text-muted-foreground font-medium">Referral XP Earned</div>
          </div>
        </div>
      </div>

      {/* Referral History Table */}
      <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-foreground">Invited Learners</h3>
            <p className="text-xs text-muted-foreground">
              Track the learning progress of peers who joined via your link.
            </p>
          </div>
          <span className="text-xs font-semibold text-muted-foreground">
            {stats?.referrals.length || 0} Total
          </span>
        </div>

        {loading ? (
          <div className="py-8 text-center text-xs text-muted-foreground">Loading referrals...</div>
        ) : !stats || stats.referrals.length === 0 ? (
          <div className="py-8 text-center space-y-2">
            <Users className="w-8 h-8 text-muted-foreground/40 mx-auto" />
            <p className="text-xs text-muted-foreground">
              No one has registered using your referral link yet.
            </p>
            <button
              type="button"
              onClick={handleCopyLink}
              className="text-xs font-bold text-primary hover:underline cursor-pointer"
            >
              Copy and share your link to get started →
            </button>
          </div>
        ) : (
          <div className="divide-y divide-border/60 overflow-hidden">
            {stats.referrals.map((item) => (
              <div key={item.id} className="py-3 flex items-center justify-between text-xs gap-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-[11px]">
                    {item.displayName.slice(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <div className="font-semibold text-foreground">{item.displayName}</div>
                    <div className="text-[11px] text-muted-foreground">
                      Joined {new Date(item.joinedAt).toLocaleDateString()}
                    </div>
                  </div>
                </div>

                <div>
                  {item.status === 'rewarded' || item.status === 'activated' ? (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                      <Check className="w-3 h-3" />
                      Activated (+50 XP)
                    </span>
                  ) : (
                    <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-medium bg-secondary text-muted-foreground border border-border">
                      Registered
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <ReferralShareModal
        isOpen={isShareModalOpen}
        onClose={() => setIsShareModalOpen(false)}
        referralLink={referralLink}
      />
    </div>
  )
}
