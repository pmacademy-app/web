'use client'

import { useRef } from 'react'
import Link from 'next/link'
import { motion, useScroll, useTransform } from 'framer-motion'
import { ModuleCardPreview } from '@/components/marketing/product-mockup/module-card-preview'
import { LessonCardPreview } from '@/components/marketing/product-mockup/lesson-card-preview'
import { XPRowPreview } from '@/components/marketing/product-mockup/xp-row-preview'
import { trackHeroCTAClick } from '@/lib/analytics'
import { useReducedMotion } from '@/hooks/use-reduced-motion'
import { FADE_UP, STAGGER_CONTAINER } from '@/lib/animation'
import { BrandLogo } from '@/components/brand/BrandLogo'
import { ArrowRight, GraduationCap } from 'lucide-react'

/**
 * Hero section — Sprint 2 §8 + Sprint 3 hero copy.
 */
export function HeroSection() {
  const prefersReducedMotion = useReducedMotion()
  const mockupRef = useRef<HTMLDivElement>(null)

  const { scrollY } = useScroll()
  const mockupY = useTransform(
    scrollY,
    [0, 400],
    prefersReducedMotion ? [0, 0] : [0, -16],
  )

  return (
    <section
      id="hero"
      aria-labelledby="hero-heading"
      className="
        relative pt-28 pb-20 lg:pt-36 lg:pb-28
        overflow-hidden
      "
    >
      {/* Rich Premium Background Gradient Mesh */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-[20%] -left-[10%] w-[50%] h-[50%] bg-primary/20 blur-[120px] rounded-full mix-blend-multiply opacity-70 animate-pulse" />
        <div className="absolute top-[10%] -right-[10%] w-[40%] h-[60%] bg-blue-500/10 blur-[120px] rounded-full mix-blend-multiply opacity-50" />
        <div className="absolute -bottom-[20%] left-[20%] w-[60%] h-[50%] bg-purple-500/10 blur-[120px] rounded-full mix-blend-multiply opacity-40" />
        <div className="absolute inset-0 bg-gradient-to-b from-surface-muted/40 via-transparent to-background" />
      </div>

      <div className="relative max-w-[1120px] mx-auto px-5 lg:px-8 z-10">
        <div className="grid grid-cols-1 lg:grid-cols-[5fr_7fr] gap-12 lg:gap-16 items-center">

          {/* ── Left: Content ──────────────────────────────────────────────── */}
          <motion.div
            variants={prefersReducedMotion ? undefined : STAGGER_CONTAINER}
            initial={prefersReducedMotion ? false : 'hidden'}
            animate="visible"
            className="flex flex-col gap-6"
          >
            <motion.div variants={prefersReducedMotion ? undefined : FADE_UP}>
              <BrandLogo variant="animated-full" size="xl" priority className="justify-start" />
            </motion.div>

            {/* Badge */}
            <motion.div variants={prefersReducedMotion ? undefined : FADE_UP}>
              <span className="
                inline-flex items-center gap-1.5 px-3 py-1.5
                bg-primary/5 text-primary border border-primary/20
                rounded-full text-sm font-semibold backdrop-blur-md shadow-sm
              ">
                <GraduationCap size={14} aria-hidden="true" />
                90 lessons. Free forever.
              </span>
            </motion.div>

            <motion.h1
              id="hero-heading"
              variants={prefersReducedMotion ? undefined : FADE_UP}
              className="
                font-display text-4xl sm:text-5xl lg:text-7xl
                font-extrabold text-foreground leading-[1.1] tracking-tight drop-shadow-sm
              "
            >
              Learn Product Management.<br className="hidden lg:block" />{' '}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-blue-500">Build real products.</span>{' '}
              Completely free.
            </motion.h1>

            {/* Subheadline */}
            <motion.p
              variants={prefersReducedMotion ? undefined : FADE_UP}
              className="text-body-lg text-locked leading-relaxed max-w-[500px]"
            >
              A structured PM curriculum with 90 lessons, skill analytics, interactive quizzes, and portfolio artifacts. Built for people who want more than a certificate.
            </motion.p>

            {/* CTAs */}
            <motion.div
              variants={prefersReducedMotion ? undefined : FADE_UP}
              className="flex flex-wrap gap-3"
            >
              <Link
                href="/signup"
                onClick={() => trackHeroCTAClick('hero')}
                className="
                  inline-flex items-center justify-center gap-2 px-8 py-3.5
                  bg-gradient-to-r from-primary to-blue-600 text-primary-foreground
                  text-sm font-bold rounded-full
                  shadow-lg shadow-primary/25 hover:shadow-xl hover:shadow-primary/30
                  hover:opacity-95 active:scale-[0.98] hover:-translate-y-0.5
                  transition-all duration-200
                  focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus
                "
              >
                Start Learning Free <ArrowRight size={16} aria-hidden="true" />
              </Link>
              <Link
                href="/curriculum"
                className="
                  inline-flex items-center justify-center gap-2 px-8 py-3.5
                  bg-surface-muted/50 text-foreground backdrop-blur-sm
                  border border-border hover:border-border-strong hover:bg-surface-muted
                  text-sm font-bold rounded-full
                  transition-all duration-200
                  focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus
                "
              >
                Explore Curriculum
              </Link>
            </motion.div>

            {/* Trust line */}
            <motion.p
              variants={prefersReducedMotion ? undefined : FADE_UP}
              className="text-body-sm text-locked font-medium flex items-center gap-2"
            >
              <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block animate-pulse" />
              90 structured lessons • 100% Free Forever • Free account required for progress tracking
            </motion.p>
          </motion.div>

          {/* ── Right: Product Mockup Cluster ──────────────────────────────── */}
          <motion.div
            ref={mockupRef}
            style={{ y: mockupY }}
            initial={prefersReducedMotion ? false : { opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.2, ease: [0, 0, 0.2, 1] }}
            aria-label="Preview showing PM Academy learning interface: skill radar with 7 competency axes, module 03 Execution at 42 percent progress, lesson card for Writing a PRD, and XP plus streak tracker showing 1240 XP and 7 day streak"
            role="img"
            className="
              hidden lg:flex flex-col items-center gap-4
              relative
            "
          >
            {/* Decorative background glow */}
            <div
              aria-hidden="true"
              className="absolute inset-0 bg-gradient-radial from-primary/5 to-transparent rounded-xl pointer-events-none"
            />

            <div className="flex flex-col items-center gap-3 w-full max-w-[360px] relative">
              <ModuleCardPreview />
              <LessonCardPreview />
              <XPRowPreview />
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  )
}
