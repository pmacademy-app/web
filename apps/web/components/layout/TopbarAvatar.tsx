'use client'

import { useState } from 'react'
import { User } from 'lucide-react'

interface TopbarAvatarProps {
  name: string | null
  avatarUrl?: string | null
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

  return (
    <div
      className="relative w-8 h-8 rounded-full overflow-hidden bg-muted/40 flex items-center justify-center border border-border/80 shadow-xs"
      aria-hidden="true"
      data-testid="topbar-avatar"
    >
      {avatarUrl && avatarUrl !== failedUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- user-supplied remote URL, matches prior markup
        <img
          src={avatarUrl}
          alt=""
          className="w-full h-full object-cover"
          onError={() => setFailedUrl(avatarUrl)}
        />
      ) : (
        <div className="w-full h-full bg-primary/10 text-primary flex items-center justify-center font-bold text-xs select-none">
          {initial ?? <User className="w-3.5 h-3.5" />}
        </div>
      )}
    </div>
  )
}
