'use client'

import { useState } from 'react'
import Image from 'next/image'
import { User } from 'lucide-react'

interface TopbarAvatarProps {
  name: string | null
  avatarUrl?: string | null
}

/**
 * Only Supabase Storage URLs go through the image optimizer: they are the hosts
 * next.config `images.remotePatterns` allows (`**.supabase.co`, `**.supabase.in`).
 * Anything else (an OAuth provider photo, a legacy relative path) renders as-is via
 * `unoptimized`, because the default loader throws in development for an unlisted host
 * and the optimizer rejects it in production.
 */
function isOptimizableAvatarUrl(url: string): boolean {
  try {
    const { protocol, hostname } = new URL(url)
    return protocol === 'https:' && /\.supabase\.(co|in)$/.test(hostname)
  } catch {
    return false
  }
}

/**
 * Circular avatar shown inside the Topbar profile menu button.
 *
 * Shows the learner's uploaded photo when one exists and loads. Otherwise
 * (no photo, or the photo URL fails to load) it falls back
 * to the first letter of their name, or a generic user icon when there is no
 * name. It is decorative: the surrounding button already carries the
 * accessible name, so the avatar is hidden from assistive tech.
 */
export function TopbarAvatar({ name, avatarUrl }: TopbarAvatarProps) {
  const trimmedName = name?.trim() ?? ''
  const initial = trimmedName ? trimmedName[0].toUpperCase() : null
  // Remember which URL failed rather than a boolean, so a new avatar URL gets
  // a fresh attempt without an effect to reset the flag.
  const [failedUrl, setFailedUrl] = useState<string | null>(null)
  // next/image rejects a src with leading or trailing whitespace.
  const src = avatarUrl?.trim() ?? ''

  return (
    <div
      className="relative w-8 h-8 rounded-full overflow-hidden bg-muted/40 flex items-center justify-center border border-border/80 shadow-xs"
      aria-hidden="true"
      data-testid="topbar-avatar"
    >
      {src && src !== failedUrl ? (
        // Fixed 32px box: width/height with no `sizes` gives a 1x/2x srcset (w=32, w=64),
        // which is what the Next docs recommend for fixed-size images. A `sizes` prop would
        // switch to the full responsive srcset with a 3840px fallback src for no gain.
        <Image
          src={src}
          alt=""
          width={32}
          height={32}
          unoptimized={!isOptimizableAvatarUrl(src)}
          className="w-full h-full object-cover"
          onError={() => setFailedUrl(src)}
        />
      ) : (
        <div className="w-full h-full bg-primary/10 text-primary flex items-center justify-center font-bold text-xs select-none">
          {initial ?? <User className="w-3.5 h-3.5" />}
        </div>
      )}
    </div>
  )
}
