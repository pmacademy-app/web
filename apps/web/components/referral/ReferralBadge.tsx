'use client'

import { useEffect, useState } from 'react'
import { Gift, CheckCircle } from 'lucide-react'

interface ReferrerData {
  id: string
  username: string | null
  name: string | null
}

export function ReferralBadge({ refCode }: { refCode?: string | null }) {
  const [referrer, setReferrer] = useState<ReferrerData | null>(null)
  const [loading, setLoading] = useState<boolean>(() => Boolean(refCode))

  useEffect(() => {
    if (!refCode) {
      return
    }

    let isMounted = true
    async function fetchReferrer() {
      try {
        const res = await fetch(`/api/referrals/resolve?code=${encodeURIComponent(refCode || '')}`)
        if (!res.ok) return
        const data = await res.json()
        if (data?.valid && data.referrer && isMounted) {
          setReferrer(data.referrer)
        }
      } catch (err) {
        console.warn('[ReferralBadge] Failed to resolve referrer:', err)
      } finally {
        if (isMounted) setLoading(false)
      }
    }

    fetchReferrer()
    return () => {
      isMounted = false
    }
  }, [refCode])

  if (loading || !referrer) {
    return null
  }

  const displayName = referrer.username ? `@${referrer.username}` : referrer.name || 'a peer'

  return (
    <div className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl bg-primary/10 border border-primary/20 text-xs text-primary-foreground animate-fade-in shadow-xs mb-4">
      <div className="flex items-center justify-center w-6 h-6 rounded-lg bg-primary/20 text-primary shrink-0">
        <Gift className="w-3.5 h-3.5" />
      </div>
      <div className="flex-1">
        <p className="text-foreground font-medium">
          You were invited by <strong className="text-primary font-semibold">{displayName}</strong>
        </p>
        <p className="text-muted-foreground text-[11px]">
          Join free today to get full access to 90 lessons, interactive quizzes, and capstones.
        </p>
      </div>
      <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0" />
    </div>
  )
}
