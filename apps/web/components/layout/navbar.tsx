'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { Menu, X, Coffee, ArrowRight } from 'lucide-react'
import { useScrolled } from '@/hooks/use-scrolled'
import { useSessionCta } from '@/hooks/use-session-cta'
import {
  trackDashboardCTAClick,
  trackHeroCTAClick,
  trackNavLinkClick,
  trackNavLoginClick,
  type NavSurface,
} from '@/lib/analytics'
import { DASHBOARD_HREF, LOGIN_HREF, NAV_LINKS } from '@/config/navigation'
import { BRAND } from '@/lib/brand'
import { BrandLogo } from '@/components/brand/BrandLogo'
import { cn } from '@/lib/utils'

const FOCUS_RING =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-background'

// ─── Logo ─────────────────────────────────────────────────────────────────────

function Logo() {
  return (
    <Link
      href="/"
      aria-label={`${BRAND.fullName} home`}
      className="flex items-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus rounded-sm"
    >
      <BrandLogo variant="mark-prodily" size="sm" priority />
    </Link>
  )
}

// ─── Desktop Nav Link ─────────────────────────────────────────────────────────

function NavLink({
  href,
  label,
  weight,
}: {
  href: string
  label: string
  weight?: 'primary' | 'secondary' | 'tertiary'
}) {
  return (
    <Link
      href={href}
      onClick={() => trackNavLinkClick(label, href, 'desktop')}
      className={cn(
        'group relative transition-colors duration-200',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus rounded-xs',
        'inline-flex items-center min-h-11 px-2.5',
        weight === 'primary' && 'text-body-sm font-semibold text-foreground hover:text-primary',
        weight === 'secondary' && 'text-body-sm font-medium text-ink-muted hover:text-foreground',
        weight === 'tertiary' && 'text-body-sm font-normal text-ink-muted hover:text-foreground',
        !weight && 'text-body-sm font-medium text-ink-muted hover:text-foreground',
      )}
    >
      {label}
      {/* Underline that grows from the centre on hover. Transform only. */}
      <span
        aria-hidden="true"
        className="absolute inset-x-2.5 bottom-2.5 h-px origin-center scale-x-0 bg-current opacity-60 transition-transform duration-300 ease-out-quint group-hover:scale-x-100 motion-reduce:transition-none"
      />
    </Link>
  )
}

// ─── Session-aware CTA ────────────────────────────────────────────────────────

const CTA_BASE = cn(
  'group inline-flex items-center justify-center gap-1.5 font-semibold rounded-full whitespace-nowrap',
  'bg-primary text-primary-foreground hover:bg-primary-hover',
  'active:scale-[0.97]',
  'transition-[background-color,transform] duration-200 ease-out-quint',
  'motion-reduce:transition-colors motion-reduce:active:scale-100',
  FOCUS_RING,
)

const CTA_ARROW =
  'opacity-80 group-hover:opacity-100 group-hover:translate-x-0.5 transition-[transform,opacity] duration-200 ease-out-quint motion-reduce:transition-none motion-reduce:group-hover:translate-x-0'

/**
 * "Start Learning Free" for visitors, "Go to dashboard" once the session check says the
 * visitor is signed in. Both links sit in the same grid cell and only visibility
 * changes, so the cell is always as wide as the longer label and the header never
 * reflows when the answer arrives. `invisible` also removes the hidden link from the
 * tab order and the accessibility tree.
 */
function SessionCTA({
  authenticated,
  size,
  onNavigate,
}: {
  authenticated: boolean
  size: 'md' | 'lg'
  onNavigate?: () => void
}) {
  // Both sizes give a 44px target. The desktop pill keeps its compact padding and type
  // so the taller hit area does not make the bar feel heavier.
  const sizing = size === 'md' ? 'min-h-11 px-4 text-[13px]' : 'min-h-11 px-5 text-sm w-full'

  return (
    <span className={cn('grid', size === 'lg' && 'w-full')}>
      <Link
        href="/signup"
        aria-hidden={authenticated || undefined}
        tabIndex={authenticated ? -1 : undefined}
        onClick={() => {
          trackHeroCTAClick('nav')
          onNavigate?.()
        }}
        className={cn(CTA_BASE, sizing, '[grid-area:1/1]', authenticated && 'invisible')}
      >
        <span>Start Learning Free</span>
        <ArrowRight size={13} aria-hidden="true" className={CTA_ARROW} />
      </Link>
      <Link
        href={DASHBOARD_HREF}
        aria-hidden={!authenticated || undefined}
        tabIndex={authenticated ? undefined : -1}
        onClick={() => {
          trackDashboardCTAClick('nav')
          onNavigate?.()
        }}
        className={cn(CTA_BASE, sizing, '[grid-area:1/1]', !authenticated && 'invisible')}
      >
        <span>Go to dashboard</span>
        <ArrowRight size={13} aria-hidden="true" className={CTA_ARROW} />
      </Link>
    </span>
  )
}

/** Quiet sign-in link for returning learners (P0-6). */
function LoginLink({
  surface,
  hidden,
  onNavigate,
  className,
}: {
  surface: NavSurface
  hidden: boolean
  onNavigate?: () => void
  className?: string
}) {
  return (
    <Link
      href={LOGIN_HREF}
      aria-hidden={hidden || undefined}
      tabIndex={hidden ? -1 : undefined}
      onClick={() => {
        trackNavLoginClick(surface)
        onNavigate?.()
      }}
      className={cn(className, hidden && 'invisible')}
    >
      Log in
    </Link>
  )
}

// ─── Navbar ───────────────────────────────────────────────────────────────────

/**
 * Marketing site top navigation.
 * Fixed top, height 72px desktop / 64px mobile.
 * Scrolled state: border-bottom and backdrop blur fade in.
 * Signed-in visitors see "Go to dashboard" in place of signup, and no "Log in".
 */
export function Navbar() {
  const [menuOpen, setMenuOpen] = useState(false)
  const isScrolled = useScrolled(16)
  const { authenticated } = useSessionCta()

  const menuButtonRef = useRef<HTMLButtonElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const sheetRef = useRef<HTMLDivElement>(null)

  const closeMenu = () => setMenuOpen(false)

  // Modal focus handling: move focus into the sheet when it opens, and hand it back to
  // the menu toggle when it closes (Escape, overlay, close button or a link).
  useEffect(() => {
    if (!menuOpen) return
    closeButtonRef.current?.focus()
    const trigger = menuButtonRef.current
    return () => {
      trigger?.focus()
    }
  }, [menuOpen])

  // Lock page scroll behind the open sheet so the page does not scroll under a finger
  // dragging inside the menu. Restores whatever overflow value was there before.
  useEffect(() => {
    if (!menuOpen) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [menuOpen])

  // Focus containment: Escape closes, Tab and Shift+Tab wrap inside the sheet, and the
  // page behind it (main content and site footer) is made inert so neither pointer nor
  // assistive tech can reach it while the modal is open.
  useEffect(() => {
    if (!menuOpen) return

    const background = [
      document.querySelector<HTMLElement>('#main-content'),
      document.querySelector<HTMLElement>('footer[aria-label="Site footer"]'),
    ].filter((el): el is HTMLElement => el !== null && !el.inert)
    background.forEach((el) => {
      el.inert = true
    })

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMenuOpen(false)
        return
      }
      if (e.key !== 'Tab') return
      const sheet = sheetRef.current
      if (!sheet) return
      const focusable = Array.from(
        sheet.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((el) => el.getClientRects().length > 0)
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      const active = document.activeElement
      const inside = active instanceof Node && sheet.contains(active)
      if (e.shiftKey && (active === first || !inside)) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && (active === last || !inside)) {
        e.preventDefault()
        first.focus()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      background.forEach((el) => {
        el.inert = false
      })
    }
  }, [menuOpen])

  // The sheet is mobile only. If the viewport grows past lg while it is open, close it so
  // the scroll lock and inert background never linger on desktop.
  useEffect(() => {
    if (!menuOpen) return
    // The toggle is lg:hidden, so the sheet can only open below lg; listening for the
    // change is enough.
    const mql = window.matchMedia('(min-width: 1024px)')
    const handleChange = (e: MediaQueryListEvent) => {
      if (e.matches) setMenuOpen(false)
    }
    mql.addEventListener('change', handleChange)
    return () => mql.removeEventListener('change', handleChange)
  }, [menuOpen])

  return (
    <>
      <header
        role="banner"
        className={cn(
          'fixed top-0 left-0 right-0 z-[50]',
          'animate-in fade-in slide-in-from-top-2 duration-200 fill-mode-both motion-reduce:animate-none',
          'h-16 lg:h-[72px]',
          'border-b transition-[background-color,border-color] duration-300',
          isScrolled
            ? 'bg-background/80 supports-[backdrop-filter]:bg-background/70 backdrop-blur-md backdrop-saturate-150 border-border/80'
            : 'bg-transparent border-transparent',
        )}
      >
        <div className="max-w-[1120px] mx-auto px-5 lg:px-8 h-full flex items-center justify-between gap-6">
          <Logo />

          {/* Desktop Navigation */}
          <nav aria-label="Main" className="hidden lg:flex items-center gap-1">
            {NAV_LINKS.map((link) => (
              <NavLink key={link.href} href={link.href} label={link.label} weight={link.weight} />
            ))}
          </nav>

          {/* Desktop Actions */}
          <div className="hidden lg:flex items-center gap-2">
            <LoginLink
              surface="desktop"
              hidden={authenticated}
              className={cn(
                'inline-flex items-center min-h-11 px-3 rounded-full text-body-sm font-medium text-ink-muted',
                'hover:text-foreground transition-colors duration-200',
                FOCUS_RING,
              )}
            />
            <SessionCTA authenticated={authenticated} size="md" />
          </div>

          {/* Mobile Menu Toggle */}
          <button
            ref={menuButtonRef}
            type="button"
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={menuOpen}
            aria-controls="mobile-menu"
            onClick={() => setMenuOpen((prev) => !prev)}
            className="
              lg:hidden flex items-center justify-center
              w-11 h-11 min-w-[44px] min-h-[44px] rounded-sm text-foreground
              hover:bg-surface-muted
              transition-colors duration-[120ms]
              focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus
            "
          >
            {menuOpen ? <X size={20} aria-hidden="true" /> : <Menu size={20} aria-hidden="true" />}
          </button>
        </div>
      </header>

      {/* Mobile Menu Sheet */}
      {menuOpen && (
          <>
            {/* Overlay */}
            <div
              className="fixed inset-0 z-[45] bg-foreground/30 backdrop-blur-[2px] lg:hidden animate-in fade-in duration-300 fill-mode-both motion-reduce:animate-none"
              onClick={closeMenu}
              aria-hidden="true"
            />

            {/* Sheet */}
            <div
              ref={sheetRef}
              id="mobile-menu"
              role="dialog"
              aria-modal="true"
              aria-label="Navigation menu"
              className="
                fixed top-0 right-0 bottom-0 z-[60]
                w-[min(20rem,85vw)] bg-surface border-l border-border
                flex flex-col pt-16 pb-8 px-6 overflow-y-auto
                lg:hidden
                animate-in slide-in-from-right duration-300 ease-out-quint fill-mode-both
                motion-reduce:animate-none
              "
            >
              {/* Close */}
              <button
                ref={closeButtonRef}
                type="button"
                aria-label="Close menu"
                onClick={closeMenu}
                className="
                  absolute top-3 right-3
                  w-11 h-11 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-sm
                  text-foreground hover:bg-surface-muted
                  transition-colors duration-[120ms]
                  focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus
                "
              >
                <X size={20} aria-hidden="true" />
              </button>

              {/* Intro copy */}
              <p className="text-body-sm text-ink-muted mb-6">
                A structured path to learn product management, build product work, and create proof of your skills.
              </p>

              {/* Nav links */}
              <nav aria-label="Mobile navigation" className="flex flex-col gap-1 mb-8">
                {NAV_LINKS.map((link, index) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    onClick={() => {
                      trackNavLinkClick(link.label, link.href, 'mobile')
                      closeMenu()
                    }}
                    style={{ animationDelay: `${80 + index * 35}ms` }}
                    className={cn(
                      'flex items-center min-h-11 px-3 rounded-md transition-colors duration-[120ms] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus',
                      'animate-in fade-in slide-in-from-right-3 duration-300 ease-out-quint fill-mode-both motion-reduce:animate-none',
                      link.weight === 'primary' && 'text-body font-semibold text-foreground',
                      link.weight === 'secondary' && 'text-body font-medium text-foreground',
                      link.weight === 'tertiary' && 'text-body-sm font-normal text-ink-muted',
                      !link.weight && 'text-body font-medium text-foreground',
                      'hover:bg-surface-muted',
                    )}
                  >
                    {link.label}
                  </Link>
                ))}
              </nav>

              {/* Support, sign in & CTA */}
              <div className="mt-auto flex flex-col gap-2.5">
                <a
                  href="https://buymeacoffee.com/prodily"
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={closeMenu}
                  className="
                    w-full inline-flex items-center justify-center gap-2 min-h-11 px-4
                    bg-warning-bg text-warning font-semibold text-sm rounded-full
                    border border-accent/30 hover:border-accent/60
                    transition-colors duration-200
                    focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus
                  "
                >
                  <Coffee size={15} className="text-accent" aria-hidden="true" />
                  <span>Buy Me a Coffee</span>
                </a>

                {!authenticated && (
                  <LoginLink
                    surface="mobile"
                    hidden={false}
                    onNavigate={closeMenu}
                    className={cn(
                      'w-full inline-flex items-center justify-center h-11 px-5 rounded-full',
                      'border border-border bg-surface text-sm font-semibold text-foreground',
                      'hover:border-border-strong hover:bg-surface-muted transition-colors duration-200',
                      FOCUS_RING,
                    )}
                  />
                )}

                <SessionCTA authenticated={authenticated} size="lg" onNavigate={closeMenu} />
              </div>
            </div>
          </>
        )}
    </>
  )
}
