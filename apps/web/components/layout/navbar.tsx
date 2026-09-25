'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Menu, X, Coffee, ArrowRight } from 'lucide-react'
import { useScrolled } from '@/hooks/use-scrolled'
import { trackHeroCTAClick } from '@/lib/analytics'
import { NAV_LINKS } from '@/config/navigation'
import { BRAND } from '@/lib/brand'
import { BrandLogo } from '@/components/brand/BrandLogo'
import { cn } from '@/lib/utils'

// ─── Logo ─────────────────────────────────────────────────────────────────────

function Logo() {
  return (
    <Link
      href="/"
      aria-label={`${BRAND.fullName} — Home`}
      className="flex items-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus rounded-sm"
    >
      <BrandLogo variant="full" size="sm" priority />
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
      className={cn(
        'group relative transition-colors duration-200',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus rounded-xs',
        'px-2.5 py-1.5',
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
        className="absolute inset-x-2.5 -bottom-px h-px origin-center scale-x-0 bg-current opacity-60 transition-transform duration-300 ease-out-quint group-hover:scale-x-100 motion-reduce:transition-none"
      />
    </Link>
  )
}

// ─── CTA Button ───────────────────────────────────────────────────────────────

function CTAButton({
  size = 'md',
  location,
  onClick,
}: {
  size?: 'sm' | 'md'
  location: Parameters<typeof trackHeroCTAClick>[0]
  onClick?: () => void
}) {
  const handleClick = () => {
    trackHeroCTAClick(location)
    onClick?.()
  }

  return (
    <Link
      href="/signup"
      onClick={handleClick}
      className={cn(
        'group relative inline-flex items-center justify-center gap-1.5 font-semibold rounded-lg',
        'bg-primary text-primary-foreground',
        'shadow-[0_1px_2px_rgba(23,26,23,0.12),inset_0_1px_0_rgba(255,255,255,0.18)]',
        'hover:bg-primary-hover hover:shadow-[0_6px_18px_-6px_rgba(31,107,78,0.5),inset_0_1px_0_rgba(255,255,255,0.18)]',
        'active:scale-[0.97]',
        'transition-[background-color,box-shadow,transform] duration-200 ease-out-quint',
        'motion-reduce:transition-colors motion-reduce:active:scale-100',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        size === 'md' ? 'h-9 px-4 text-xs sm:text-[13px]' : 'h-8 px-3 text-xs',
      )}
    >
      <span>Start Learning Free</span>
      <ArrowRight
        size={13}
        aria-hidden="true"
        className="opacity-80 group-hover:opacity-100 group-hover:translate-x-0.5 transition-[transform,opacity] duration-200 ease-out-quint motion-reduce:transition-none motion-reduce:group-hover:translate-x-0"
      />
    </Link>
  )
}

// ─── Navbar ───────────────────────────────────────────────────────────────────

/**
 * Marketing site top navigation — Sprint 2 §7 + Sprint 3 navigation copy.
 * Sticky top, height 72px desktop / 64px mobile.
 * Scrolled state: border-bottom + backdrop-blur fades in.
 */
export function Navbar() {
  const [menuOpen, setMenuOpen] = useState(false)
  const isScrolled = useScrolled(16)

  const closeMenu = () => setMenuOpen(false)

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

  useEffect(() => {
    if (!menuOpen) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMenuOpen(false)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [menuOpen])

  return (
    <>
      <header
        role="banner"
        className={cn(
          'fixed top-0 left-0 right-0 z-[50]',
          'animate-in fade-in slide-in-from-top-2 duration-200 fill-mode-both motion-reduce:animate-none',
          'h-16 lg:h-[72px]',
          'border-b transition-[background-color,border-color,box-shadow] duration-300',
          isScrolled
            ? 'bg-background/80 supports-[backdrop-filter]:bg-background/70 backdrop-blur-md backdrop-saturate-150 border-border/80 shadow-[0_1px_12px_-6px_rgba(23,26,23,0.12)]'
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
          <div className="hidden lg:flex items-center gap-2.5">
            <CTAButton location="nav" />
          </div>

          {/* Mobile Menu Toggle */}
          <button
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
              id="mobile-menu"
              role="dialog"
              aria-label="Navigation menu"
              className="
                fixed top-0 right-0 bottom-0 z-[60]
                w-[min(20rem,85vw)] bg-surface border-l border-border shadow-md
                flex flex-col pt-16 pb-8 px-6 overflow-y-auto
                lg:hidden
                animate-in slide-in-from-right duration-300 ease-out-quint fill-mode-both
                motion-reduce:animate-none
              "
            >
              {/* Close */}
              <button
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
                    onClick={closeMenu}
                    style={{ animationDelay: `${80 + index * 35}ms` }}
                    className={cn(
                      'px-3 py-2.5 rounded-md transition-colors duration-[120ms] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus',
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

              {/* Support & CTA */}
              <div className="mt-auto flex flex-col gap-2.5">
                <a
                  href="https://buymeacoffee.com/prodily"
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={closeMenu}
                  className="
                    w-full inline-flex items-center justify-center gap-2 px-4 py-2.5
                    bg-warning-bg text-warning font-semibold text-sm rounded-lg
                    border border-accent/30 hover:border-accent/60
                    transition-colors duration-200
                    focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus
                  "
                >
                  <Coffee size={15} className="text-accent" aria-hidden="true" />
                  <span>Buy Me a Coffee</span>
                </a>

                <CTAButton size="md" location="nav" onClick={closeMenu} />
              </div>
            </div>
          </>
        )}
    </>
  )
}
