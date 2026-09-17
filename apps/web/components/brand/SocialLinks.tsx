import Link from 'next/link'
import { BRAND } from '@/lib/brand'
import { cn } from '@/lib/utils'

/**
 * Monochrome social glyphs (24x24, currentColor).
 * lucide-react no longer ships brand marks, so the paths live here rather than
 * pulling in an extra icon dependency for three links.
 */
function LinkedInIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">
      <path d="M19 3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14m-.5 15.5v-5.3a3.26 3.26 0 0 0-3.26-3.26c-.85 0-1.84.52-2.28 1.3v-1.11h-2.79v8.37h2.79v-4.93c0-.77.62-1.4 1.39-1.4a1.4 1.4 0 0 1 1.4 1.4v4.93h2.75M6.46 10.9v8.37H9.25V10.9H6.46M7.86 6.74a1.64 1.64 0 1 0 0 3.28 1.64 1.64 0 0 0 0-3.28Z" />
    </svg>
  )
}

function XIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  )
}

function InstagramIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">
      <path d="M12 2.16c3.2 0 3.58.01 4.85.07 3.25.15 4.77 1.69 4.92 4.92.06 1.27.07 1.65.07 4.85s-.01 3.58-.07 4.85c-.15 3.23-1.66 4.77-4.92 4.92-1.27.06-1.65.07-4.85.07s-3.58-.01-4.85-.07c-3.26-.15-4.77-1.7-4.92-4.92C2.17 15.58 2.16 15.2 2.16 12s.01-3.58.07-4.85c.15-3.23 1.66-4.77 4.92-4.92C8.42 2.17 8.8 2.16 12 2.16Zm0 1.8c-3.15 0-3.5.01-4.74.07-2.3.1-3.32 1.14-3.43 3.43-.06 1.24-.07 1.59-.07 4.74s.01 3.5.07 4.74c.1 2.29 1.13 3.32 3.43 3.43 1.24.06 1.59.07 4.74.07s3.5-.01 4.74-.07c2.3-.11 3.32-1.14 3.43-3.43.06-1.24.07-1.59.07-4.74s-.01-3.5-.07-4.74c-.11-2.29-1.13-3.32-3.43-3.43-1.24-.06-1.59-.07-4.74-.07Zm0 3.07a4.97 4.97 0 1 1 0 9.94 4.97 4.97 0 0 1 0-9.94Zm0 1.8a3.17 3.17 0 1 0 0 6.34 3.17 3.17 0 0 0 0-6.34Zm5.17-3.2a1.16 1.16 0 1 1 0 2.32 1.16 1.16 0 0 1 0-2.32Z" />
    </svg>
  )
}

const SOCIAL_LINKS = [
  { label: 'LinkedIn', href: BRAND.social.linkedin, Icon: LinkedInIcon },
  { label: 'X', href: BRAND.social.twitter, Icon: XIcon },
  { label: 'Instagram', href: BRAND.social.instagram, Icon: InstagramIcon },
] as const

/**
 * Compact row of monochrome social links.
 * URLs are centralised in BRAND.social (lib/brand.ts).
 */
export function SocialLinks({ className }: { className?: string }) {
  return (
    <ul className={cn('flex items-center gap-2', className)}>
      {SOCIAL_LINKS.map(({ label, href, Icon }) => (
        <li key={label}>
          <Link
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`${BRAND.company} on ${label} (opens in a new tab)`}
            className="
              inline-flex items-center justify-center w-9 h-9 rounded-md
              border border-border text-locked
              hover:text-foreground hover:border-foreground/30
              transition-colors duration-[120ms]
              focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus
            "
          >
            <Icon className="w-[18px] h-[18px]" />
          </Link>
        </li>
      ))}
    </ul>
  )
}
