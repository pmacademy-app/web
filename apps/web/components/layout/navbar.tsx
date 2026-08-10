'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Menu, X } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { useScrolled } from '@/hooks/use-scrolled'
import { useReducedMotion } from '@/hooks/use-reduced-motion'
import { trackHeroCTAClick } from '@/lib/analytics'
import { NAV_LINKS } from '@/config/navigation'
import { BRAND } from '@/lib/brand'
import { BrandMarkProdily } from '@/components/brand/BrandLogo'
import { cn } from '@/lib/utils'

// ─── Logo ─────────────────────────────────────────────────────────────────────

function Logo() {
  return (
    <Link
      href="/"
      aria-label={`${BRAND.fullName} — Home`}
      className="flex items-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus rounded-sm"
    >
      <BrandMarkProdily size="sm" priority />
    </Link>
  )
}

// ─── Desktop Nav Link ─────────────────────────────────────────────────────────

function NavLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="
        text-body-sm font-medium text-locked
        hover:text-foreground
        transition-colors duration-[120ms]
        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus rounded-xs
        px-1 py-0.5
      "
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
    <div className="flex items-center gap-3">
      <Link
        href={BRAND.social.buyMeACoffee}
        target="_blank"
        rel="noopener noreferrer"
        className={cn(
          'hidden sm:inline-flex items-center font-medium rounded-sm border border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400 hover:bg-amber-500/20 transition-all',
          size === 'md' && 'px-3 py-1.5 text-xs',
          size === 'sm' && 'px-2.5 py-1 text-xs',
        )}
      >
        ☕ Buy Me a Coffee
      </Link>

      <Link
        href="/signup"
        onClick={handleClick}
        className={cn(
          'inline-flex items-center justify-center font-medium rounded-sm min-h-[44px]',
          'bg-primary text-primary-foreground',
          'hover:opacity-90 active:scale-[0.98]',
          'transition-all duration-[120ms]',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus',
          size === 'md' && 'px-4 py-2.5 text-body-sm',
          size === 'sm' && 'px-3 py-2 text-body-sm',
        )}
      >
        Start Learning Free
      </Link>
    </div>
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
  const prefersReducedMotion = useReducedMotion()

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
      <motion.header
        role="banner"
        initial={prefersReducedMotion ? false : { opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.18, ease: [0, 0, 0.2, 1] }}
        className={cn(
          'fixed top-0 left-0 right-0 z-[50]',
          'h-16 lg:h-[72px]',
          'transition-all duration-[180ms]',
          isScrolled
            ? 'bg-background/92 backdrop-blur-sm border-b border-border'
            : 'bg-transparent',
        )}
      >
        <div className="max-w-[1120px] mx-auto px-5 lg:px-8 h-full flex items-center justify-between gap-6">
          <Logo />

          {/* Desktop Navigation */}
          <nav aria-label="Main" className="hidden lg:flex items-center gap-1">
            {NAV_LINKS.map((link) => (
              <NavLink key={link.href} href={link.href} label={link.label} />
            ))}
          </nav>

          {/* Desktop CTA */}
          <div className="hidden lg:block">
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
      </motion.header>

      {/* Mobile Menu Sheet */}
      <AnimatePresence>
        {menuOpen && (
          <>
            {/* Overlay */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: prefersReducedMotion ? 0 : 0.18 }}
              className="fixed inset-0 z-[45] bg-foreground/20 backdrop-blur-sm lg:hidden"
              onClick={closeMenu}
              aria-hidden="true"
            />

            {/* Sheet */}
            <motion.div
              id="mobile-menu"
              role="dialog"
              aria-label="Navigation menu"
              initial={prefersReducedMotion ? false : { x: '100%' }}
              animate={{ x: 0 }}
              exit={prefersReducedMotion ? { opacity: 0 } : { x: '100%' }}
              transition={{ duration: prefersReducedMotion ? 0 : 0.24, ease: [0, 0, 0.2, 1] }}
              className="
                fixed top-0 right-0 bottom-0 z-[60]
                w-72 bg-surface border-l border-border
                flex flex-col pt-16 pb-8 px-6
                lg:hidden
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

              {/* Intro copy — Sprint 3 mobile menu intro */}
              <p className="text-body-sm text-locked mb-6">
                A complete PM curriculum, free from the first lesson to the final capstone.
              </p>

              {/* Nav links */}
              <nav aria-label="Mobile navigation" className="flex flex-col gap-1 mb-8">
                {NAV_LINKS.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    onClick={closeMenu}
                    className="
                      text-body font-medium text-foreground
                      px-3 py-2.5 rounded-sm
                      hover:bg-surface-muted
                      transition-colors duration-[120ms]
                      focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus
                    "
                  >
                    {link.label}
                  </Link>
                ))}
              </nav>

              {/* CTA */}
              <div className="mt-auto">
                <CTAButton size="md" location="nav" onClick={closeMenu} />
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  )
}
