'use client'

import React, { useEffect, useId, useRef, useState, useSyncExternalStore } from 'react'
import { Share2, Copy, Check, CircleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { BRAND } from '@/lib/brand'
import { badgeShareText, formatPortfolioShareUrl, portfolioShareText } from '@/lib/portfolio'
import { trackPortfolioShareClicked } from '@/lib/analytics'

interface ShareButtonProps {
  username: string
  /** Display name of the portfolio owner. Falls back to `username`. */
  name?: string | null
  /**
   * 'fellow' switches the X and native-share text to the owner announcing their PM Fellow
   * selection. Owner-only surfaces only: the text is first person. LinkedIn takes just the URL
   * (its card comes from the portfolio's OG tags), so it is the same for both.
   * Fellow is a distinction, never a certificate or credential.
   */
  context?: 'portfolio' | 'fellow' | 'badge'
  /** With context 'badge': the badge being shared (first person, owner-only surfaces). */
  badgeName?: string
}

const STATUS_RESET_MS = 2500
const POPUP_FEATURES = 'noopener,noreferrer,width=600,height=500'

type CopyStatus = 'idle' | 'copied' | 'failed'

function LinkedInIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">
      <path d="M19 3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14m-.5 15.5v-5.3a3.26 3.26 0 0 0-3.26-3.26c-.85 0-1.84.52-2.28 1.3v-1.11h-2.79v8.37h2.79v-4.93c0-.77.62-1.4 1.39-1.4a1.4 1.4 0 0 1 1.4 1.4v4.93h2.75M6.46 10.9v8.37H9.25V10.9H6.46M7.86 6.74a1.64 1.64 0 1 0 0 3.28 1.64 1.64 0 0 0 0-3.28Z" />
    </svg>
  )
}

function XIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231 5.45-6.231Zm-1.161 17.52h1.833L7.084 4.126H5.117L17.083 19.77Z" />
    </svg>
  )
}

// Native-share support is a client-only fact. Reading it through useSyncExternalStore
// with a `false` server snapshot keeps the server HTML and the first client render
// identical (no hydration mismatch), then switches to the real value after hydration.
const subscribeNoop = () => () => {}
const getNativeShareSnapshot = () =>
  typeof navigator !== 'undefined' && typeof navigator.share === 'function'
const getNativeShareServerSnapshot = () => false

function errorName(error: unknown): string | undefined {
  if (typeof error === 'object' && error !== null && 'name' in error) {
    const { name } = error as { name?: unknown }
    return typeof name === 'string' ? name : undefined
  }
  return undefined
}

export function ShareButton({ username, name, context = 'portfolio', badgeName }: ShareButtonProps) {
  const [copyStatus, setCopyStatus] = useState<CopyStatus>('idle')
  // Bumped on every status flash so the live region re-announces a repeated message.
  const [announcementId, setAnnouncementId] = useState(0)
  // Stays visible after a failed copy (until the next successful one) so the link can be copied by hand.
  const [showManualLink, setShowManualLink] = useState(false)
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const mounted = useRef(false)
  const manualLinkId = useId()
  const canNativeShare = useSyncExternalStore(
    subscribeNoop,
    getNativeShareSnapshot,
    getNativeShareServerSnapshot,
  )

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      if (resetTimer.current) clearTimeout(resetTimer.current)
    }
  }, [])

  const displayName = name?.trim() || username
  // Matches the page's canonical/OG URL, so every shared link unfurls the same card.
  const shareUrl = formatPortfolioShareUrl(
    process.env.NEXT_PUBLIC_SITE_URL || BRAND.siteUrl,
    username,
  )
  const shareText =
    context === 'fellow'
      ? `I was selected as a PM Fellow at ${BRAND.fullName}. Here is my Product Management portfolio:`
      : context === 'badge' && badgeName
        ? badgeShareText(badgeName, BRAND.fullName)
        : portfolioShareText(displayName, BRAND.fullName)

  const flashStatus = (status: CopyStatus) => {
    setCopyStatus(status)
    setAnnouncementId((id) => id + 1)
    if (resetTimer.current) clearTimeout(resetTimer.current)
    resetTimer.current = setTimeout(() => setCopyStatus('idle'), STATUS_RESET_MS)
  }

  /**
   * Copies the share URL. `track` is false when copying is the fallback of a native-share
   * attempt that was already tracked, so one click never emits two events.
   *
   * No in-flight lock here: each click is a real, idempotent copy, so a double-click
   * copying twice is harmless, and without a lock nothing can leave the button dead.
   */
  const copyLink = async (track: boolean) => {
    let ok = false
    try {
      await navigator.clipboard.writeText(shareUrl)
      ok = true
    } catch {
      ok = false
    }
    if (!mounted.current) return
    if (ok) {
      if (track) trackPortfolioShareClicked('copy')
      setShowManualLink(false)
      flashStatus('copied')
    } else {
      setShowManualLink(true)
      flashStatus('failed')
    }
  }

  const handlePrimary = async () => {
    if (typeof navigator === 'undefined' || typeof navigator.share !== 'function') {
      await copyLink(true)
      return
    }

    // Lock-free on purpose: some iOS Safari/WebView builds never settle navigator.share,
    // and a lock would leave the button dead. A second tap while a sheet is open makes
    // the browser reject with InvalidStateError, which is ignored below.
    try {
      await navigator.share({
        title: `${displayName}'s Product Management Portfolio`,
        text: shareText,
        url: shareUrl,
      })
      trackPortfolioShareClicked('native')
    } catch (error) {
      const reason = errorName(error)
      // A share is already in progress: this click is a duplicate, not a new intent.
      if (reason === 'InvalidStateError') return
      // The user opened the share sheet, so the intent counts even if they then cancelled.
      trackPortfolioShareClicked('native')
      if (reason === 'AbortError') return
      // Any other failure (unsupported payload, permission) falls back to copying, untracked.
      await copyLink(false)
    }
  }

  const shareOnLinkedIn = () => {
    trackPortfolioShareClicked('linkedin')
    window.open(
      `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(shareUrl)}`,
      '_blank',
      POPUP_FEATURES,
    )
  }

  const shareOnX = () => {
    trackPortfolioShareClicked('x')
    window.open(
      `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(shareUrl)}`,
      '_blank',
      POPUP_FEATURES,
    )
  }

  const copied = copyStatus === 'copied'
  const failed = copyStatus === 'failed'

  const primaryLabel = copied
    ? 'Link Copied!'
    : failed
      ? 'Copy failed'
      : canNativeShare
        ? 'Share Portfolio'
        : 'Copy Link'

  const primaryIcon = copied ? (
    <Check aria-hidden="true" className="text-emerald-300" />
  ) : failed ? (
    <CircleAlert aria-hidden="true" />
  ) : canNativeShare ? (
    <Share2 aria-hidden="true" />
  ) : (
    <Copy aria-hidden="true" />
  )

  const announcement = copied
    ? 'Portfolio link copied to clipboard'
    : failed
      ? 'Could not copy the link. Select the link shown below the share buttons to copy it.'
      : ''

  return (
    <div className="flex flex-col gap-2">
      <div role="group" aria-label="Share this portfolio" className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          onClick={handlePrimary}
          className="font-bold text-xs"
          title={failed ? shareUrl : undefined}
        >
          {primaryIcon}
          <span>{primaryLabel}</span>
        </Button>

        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={shareOnLinkedIn}
          aria-label="Share on LinkedIn (opens in a new window)"
          title="Share on LinkedIn"
        >
          <LinkedInIcon />
        </Button>

        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={shareOnX}
          aria-label="Share on X (opens in a new window)"
          title="Share on X"
        >
          <XIcon />
        </Button>

        {/* With native share the primary button opens the share sheet, so copying needs its own control. */}
        {canNativeShare && (
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() => copyLink(true)}
            aria-label={failed ? 'Copy failed. Try copying the portfolio link again' : 'Copy portfolio link'}
            title={failed ? shareUrl : 'Copy link'}
          >
            {copied ? (
              <Check aria-hidden="true" className="text-emerald-500" />
            ) : failed ? (
              <CircleAlert aria-hidden="true" className="text-destructive" />
            ) : (
              <Copy aria-hidden="true" />
            )}
          </Button>
        )}
      </div>

      {showManualLink && (
        <div className="flex w-full max-w-xs flex-col gap-1">
          <label htmlFor={manualLinkId} className="text-xs text-muted-foreground">
            Copy this link:
          </label>
          <Input
            id={manualLinkId}
            inputSize="sm"
            readOnly
            value={shareUrl}
            onFocus={(event) => event.currentTarget.select()}
            className="rounded-md border-border font-mono"
          />
        </div>
      )}

      <span role="status" aria-live="polite" className="sr-only">
        {/* Re-keyed per flash: replacing the node makes screen readers repeat an identical message. */}
        {announcement && <span key={announcementId}>{announcement}</span>}
      </span>
    </div>
  )
}
