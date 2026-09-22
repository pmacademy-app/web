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
        'transition-colors duration-[120ms]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus rounded-xs',
        'px-2.5 py-1',
        weight === 'primary' && 'text-body-sm font-semibold text-foreground hover:text-primary',
        weight === 'secondary' && 'text-body-sm font-medium text-locked hover:text-foreground',
        weight === 'tertiary' && 'text-body-sm font-normal text-locked/80 hover:text-foreground',
        !weight && 'text-body-sm font-medium text-locked hover:text-foreground',
      )}
    >
      {label}
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
        'group relative inline-flex items-center justify-center gap-1.5 font-medium rounded-lg',
        'bg-primary text-white',
        'border border-[#288461]/80',
        'shadow-[0_1px_2px_rgba(0,0,0,0.08),inset_0_1px_0_rgba(255,255,255,0.22)]',
        'hover:bg-[#18553E] hover:border-primary hover:shadow-[0_4px_16px_rgba(31,107,78,0.25),inset_0_1px_0_rgba(255,255,255,0.25)] hover:-translate-y-0.5',
        'active:scale-[0.97] active:translate-y-0',
        'transition-all duration-150',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2F80ED] focus-visible:ring-offset-2',
        size === 'md' ? 'h-9 px-4 text-xs sm:text-[13px]' : 'h-8 px-3 text-xs',
      )}
    >
      <span>Start Learning Free</span>
      <ArrowRight size={13} className="text-white/80 group-hover:text-white group-hover:translate-x-0.5 transition-transform duration-150" />
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
          'transition-all duration-[180ms]',
          isScrolled
            ? 'bg-background border-b border-border'
            : 'bg-transparent',
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
            {menuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </header>

      {/* Mobile Menu Sheet */}
      {menuOpen && (
          <>
            {/* Overlay */}
            <div
              className="fixed inset-0 z-[45] bg-black/50 lg:hidden animate-in fade-in duration-200 fill-mode-both motion-reduce:animate-none"
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
                w-72 bg-surface border-l border-border
                flex flex-col pt-16 pb-8 px-6
                lg:hidden
                animate-in slide-in-from-right duration-[240ms] fill-mode-both
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
                <X size={20} />
              </button>

              {/* Intro copy */}
              <p className="text-body-sm text-locked mb-6">
                A structured path to learn product management, build product work, and create proof of your skills.
              </p>

              {/* Nav links */}
              <nav aria-label="Mobile navigation" className="flex flex-col gap-1 mb-8">
                {NAV_LINKS.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    onClick={closeMenu}
                    className={cn(
                      'px-3 py-2.5 rounded-sm transition-colors duration-[120ms] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus',
                      link.weight === 'primary' && 'text-body font-semibold text-foreground',
                      link.weight === 'secondary' && 'text-body font-medium text-foreground',
                      link.weight === 'tertiary' && 'text-body-sm font-normal text-locked',
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
                    bg-[#FFF7ED] text-[#9A3412] font-semibold text-sm rounded-lg
                    border border-[#FED7AA] hover:bg-[#FFEDD5]
                    transition-all duration-150
                    focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#EA580C]
                  "
                >
                  <Coffee size={15} className="text-[#EA580C]" aria-hidden="true" />
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
