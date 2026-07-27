'use client'

import { motion } from 'framer-motion'
import { useReducedMotion } from '@/hooks/use-reduced-motion'
import { PORTFOLIO_ARTIFACTS } from '@/config/content'
import * as LucideIcons from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { User, Star } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Portfolio section — Sprint 2 §14 + Sprint 3 portfolio copy.
 */
export function PortfolioSection() {
  const prefersReducedMotion = useReducedMotion()

  return (
    <section
      id="portfolio"
      aria-labelledby="portfolio-heading"
      className="py-20 lg:py-28"
    >
      <div className="max-w-[1120px] mx-auto px-5 lg:px-8">
        {/* Header */}
        <motion.div
          initial={prefersReducedMotion ? false : { opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.18, ease: [0, 0, 0.2, 1] }}
          className="text-center mb-12"
        >
          <h2
            id="portfolio-heading"
            className="font-display text-h1 lg:text-display-lg font-semibold text-foreground mb-4"
          >
            Finish with a portfolio, not just a certificate.
          </h2>
          <p className="text-body-lg text-locked max-w-[560px] mx-auto leading-relaxed">
            Every capstone becomes a public artifact you can share with hiring managers, teammates, and future employers.
          </p>
        </motion.div>

        {/* Portfolio preview */}
        <motion.div
          initial={prefersReducedMotion ? false : { opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.15 }}
          transition={{ duration: 0.3, ease: [0, 0, 0.2, 1] }}
          className="
            bg-surface border border-border rounded-xl shadow-sm overflow-hidden
          "
        >
          <div className="grid grid-cols-1 lg:grid-cols-[3fr_6fr_3fr] divide-y lg:divide-y-0 lg:divide-x divide-border">

            {/* Artifact list */}
            <div className="p-5">
              <p className="text-caption font-semibold text-locked uppercase tracking-wide mb-4">
                Portfolio Artifacts
              </p>
              <div className="space-y-2">
                {PORTFOLIO_ARTIFACTS.map((artifact, index) => {
                  const IconComponent = (LucideIcons as unknown as Record<string, LucideIcon | undefined>)[artifact.icon]
                  return (
                    <motion.div
                      key={artifact.title}
                      initial={prefersReducedMotion ? false : { opacity: 0, x: -8 }}
                      whileInView={{ opacity: 1, x: 0 }}
                      viewport={{ once: true, amount: 0.5 }}
                      transition={{ duration: 0.18, delay: index * 0.06, ease: [0, 0, 0.2, 1] }}
                      className={cn(
                        'group flex items-start gap-2.5 p-2.5 rounded-sm cursor-default',
                        'border border-transparent hover:border-border hover:bg-surface-muted',
                        'transition-all duration-[120ms]',
                        index === 0 && 'border-primary/30 bg-primary/5',
                      )}
                    >
                      {IconComponent && (
                        <div className="w-7 h-7 rounded-xs bg-surface-muted flex items-center justify-center flex-shrink-0">
                          <IconComponent size={13} className="text-foreground" aria-hidden="true" />
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="text-caption font-medium text-foreground truncate">{artifact.title}</p>
                        <p className="text-micro text-locked">{artifact.type}</p>
                      </div>
                      <span className={cn(
                        'ml-auto text-micro font-semibold px-1.5 py-0.5 rounded-xs flex-shrink-0',
                        'opacity-0 group-hover:opacity-100 transition-opacity duration-[120ms]',
                        'bg-success-bg text-success',
                      )}>
                        Portfolio-ready
                      </span>
                    </motion.div>
                  )
                })}
              </div>
            </div>

            {/* PRD Preview */}
            <div className="p-5">
              <p className="text-caption font-semibold text-locked uppercase tracking-wide mb-4">
                Sample PRD Preview
              </p>
              <div className="space-y-3">
                <h3 className="text-h4 font-semibold text-foreground">
                  Improving onboarding activation
                </h3>
                <div className="flex items-center gap-2">
                  <span className="text-caption text-success font-medium px-2 py-0.5 rounded-full bg-success-bg">
                    Portfolio-ready
                  </span>
                  <span className="text-caption text-locked">Module 03 Capstone</span>
                </div>
                <div className="space-y-2 pt-2">
                  {[
                    { label: 'Problem Statement', complete: true },
                    { label: 'User Research Summary', complete: true },
                    { label: 'Success Metrics', complete: true },
                    { label: 'Solution Overview', complete: true },
                    { label: 'Edge Cases & Risks', complete: false },
                  ].map((item) => (
                    <div key={item.label} className="flex items-center gap-2">
                      <div className={cn(
                        'w-2 h-2 rounded-full flex-shrink-0',
                        item.complete ? 'bg-success' : 'bg-border',
                      )} />
                      <span className={cn(
                        'text-body-sm',
                        item.complete ? 'text-foreground' : 'text-locked',
                      )}>
                        {item.label}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Public Profile */}
            <div className="p-5">
              <p className="text-caption font-semibold text-locked uppercase tracking-wide mb-4">
                Public Profile
              </p>
              <div className="flex flex-col items-center text-center gap-3">
                {/* Avatar */}
                <div className="w-12 h-12 rounded-full bg-primary/15 flex items-center justify-center">
                  <User size={20} className="text-primary" aria-hidden="true" />
                </div>
                <div>
                  <p className="text-body-sm font-semibold text-foreground">PM Learner</p>
                  <p className="text-caption text-locked">Level 4 · Execution Track</p>
                </div>
                {/* Level badge */}
                <div className="flex items-center gap-1 px-2.5 py-1 bg-accent/10 rounded-full">
                  <Star size={11} className="text-accent fill-accent" aria-hidden="true" />
                  <span className="text-caption font-medium text-accent">1,240 XP</span>
                </div>
                {/* Mini radar preview */}
                <div className="w-full pt-3 border-t border-border">
                  <p className="text-caption text-locked mb-2">Skill Profile</p>
                  <div className="space-y-1.5">
                    {(['execution', 'strategy', 'discovery'] as const).map((cluster) => (
                      <div key={cluster} className="flex items-center gap-2">
                        <span className="text-caption text-locked capitalize w-16 text-left flex-shrink-0">{cluster}</span>
                        <div className="flex-1 h-1 bg-border rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${cluster === 'execution' ? 74 : cluster === 'strategy' ? 62 : 68}%`,
                              backgroundColor: `var(--color-skill-${cluster})`,
                            }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Trust line */}
        <motion.p
          initial={prefersReducedMotion ? false : { opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true, amount: 0.5 }}
          transition={{ duration: 0.18, delay: 0.2 }}
          className="text-center text-body-sm text-locked mt-8"
        >
          Portfolio artifacts are shareable public links — no login required to view them.
        </motion.p>
      </div>
    </section>
  )
}
