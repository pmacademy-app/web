'use client'

import { useRef } from 'react'
import { motion, useInView } from 'framer-motion'
import { useReducedMotion } from '@/hooks/use-reduced-motion'
import { SKILL_CLUSTERS, SKILL_COLORS, SKILL_LABELS } from '@/lib/design/tokens'
import type { SkillValues } from '@/types'
import { cn } from '@/lib/utils'

interface SkillRadarProps {
  /** Current/after values (0–100 per cluster) */
  values: SkillValues
  /** Optional ghost/before values to show progression */
  previousValues?: SkillValues
  /** SVG size in px */
  size?: number
  /** Show legend below the radar */
  showLegend?: boolean
  className?: string
}

const DEFAULT_SIZE = 320

/**
 * Custom SVG Skill Radar implementing Sprint 1 §12 + Sprint 2 §13.
 * 7 axes, competency colors, ghost polygon, Framer Motion path animation.
 * Screen-reader accessible via text summary.
 */
export function SkillRadar({
  values,
  previousValues,
  size = DEFAULT_SIZE,
  showLegend = true,
  className,
}: SkillRadarProps) {
  const ref = useRef<SVGSVGElement>(null)
  const inView = useInView(ref, { once: true, amount: 0.3 })
  const prefersReducedMotion = useReducedMotion()

  const cx = size / 2
  const cy = size / 2
  const maxRadius = (size / 2) * 0.75
  const gridLevels = 4
  const clusterCount = SKILL_CLUSTERS.length

  // Convert a value (0–100) to a point on the radar
  function getPoint(clusterIndex: number, value: number): { x: number; y: number } {
    const angle = (Math.PI * 2 * clusterIndex) / clusterCount - Math.PI / 2
    const r = (value / 100) * maxRadius
    return {
      x: cx + r * Math.cos(angle),
      y: cy + r * Math.sin(angle),
    }
  }

  // Get axis endpoint (at 100%)
  function getAxisEnd(clusterIndex: number): { x: number; y: number } {
    return getPoint(clusterIndex, 100)
  }

  // Build SVG polygon points string from values
  function buildPolygon(vals: SkillValues): string {
    return SKILL_CLUSTERS.map((cluster, i) => {
      const point = getPoint(i, vals[cluster])
      return `${point.x},${point.y}`
    }).join(' ')
  }

  const shouldAnimate = inView && !prefersReducedMotion

  return (
    <div className={cn('flex flex-col gap-6', className)}>
      {/* Screen-reader text summary */}
      <p className="sr-only">
        Skill radar showing PM Academy progress across 7 competencies:{' '}
        {SKILL_CLUSTERS.map((c) => `${SKILL_LABELS[c]}: ${values[c]}%`).join(', ')}.
      </p>

      {/* SVG Radar */}
      <svg
        ref={ref}
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        aria-hidden="true"
        className="overflow-visible"
      >
        {/* Grid rings */}
        {Array.from({ length: gridLevels }, (_, i) => {
          const r = ((i + 1) / gridLevels) * maxRadius
          const ringPoints = SKILL_CLUSTERS.map((_, ci) => {
            const angle = (Math.PI * 2 * ci) / clusterCount - Math.PI / 2
            return `${cx + r * Math.cos(angle)},${cy + r * Math.sin(angle)}`
          }).join(' ')
          return (
            <polygon
              key={i}
              points={ringPoints}
              fill="none"
              stroke="var(--color-border)"
              strokeWidth="1"
              opacity="0.6"
            />
          )
        })}

        {/* Axis lines */}
        {SKILL_CLUSTERS.map((_, i) => {
          const end = getAxisEnd(i)
          return (
            <line
              key={i}
              x1={cx}
              y1={cy}
              x2={end.x}
              y2={end.y}
              stroke="var(--color-border)"
              strokeWidth="1"
              opacity="0.6"
            />
          )
        })}

        {/* Axis colored dots */}
        {SKILL_CLUSTERS.map((cluster, i) => {
          const end = getAxisEnd(i)
          return (
            <circle
              key={cluster}
              cx={end.x}
              cy={end.y}
              r="4"
              fill={SKILL_COLORS[cluster]}
              opacity="0.8"
            />
          )
        })}

        {/* Ghost polygon (previous values) */}
        {previousValues && (
          <polygon
            points={buildPolygon(previousValues)}
            fill="var(--color-surface-muted)"
            fillOpacity="0.5"
            stroke="var(--color-border-strong)"
            strokeWidth="1.5"
            strokeDasharray="4 2"
          />
        )}

        {/* Main filled polygon */}
        <motion.polygon
          points={buildPolygon(values)}
          fill="var(--color-primary)"
          fillOpacity={shouldAnimate ? 0 : 0.15}
          stroke="var(--color-primary)"
          strokeWidth="2"
          strokeLinejoin="round"
          animate={
            shouldAnimate
              ? { fillOpacity: 0.15, strokeOpacity: 1 }
              : undefined
          }
          initial={prefersReducedMotion ? undefined : { fillOpacity: 0, strokeOpacity: 0 }}
          transition={{ duration: 0.6, ease: [0, 0, 0.2, 1], delay: 0.2 }}
        />

        {/* Value dots */}
        {SKILL_CLUSTERS.map((cluster, i) => {
          const point = getPoint(i, values[cluster])
          return (
            <motion.circle
              key={cluster}
              cx={point.x}
              cy={point.y}
              r="5"
              fill={SKILL_COLORS[cluster]}
              initial={prefersReducedMotion ? undefined : { opacity: 0, scale: 0 }}
              animate={shouldAnimate ? { opacity: 1, scale: 1 } : undefined}
              transition={{ duration: 0.3, delay: 0.4 + i * 0.05 }}
              style={{ transformOrigin: `${point.x}px ${point.y}px` }}
            />
          )
        })}
      </svg>

      {/* Legend */}
      {showLegend && (
        <div className="grid grid-cols-1 gap-2" aria-hidden="true">
          {SKILL_CLUSTERS.map((cluster) => (
            <div key={cluster} className="flex items-center gap-2">
              <div
                className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                style={{ backgroundColor: SKILL_COLORS[cluster] }}
              />
              <span className="text-body-sm text-locked">{SKILL_LABELS[cluster]}</span>
              <span className="ml-auto text-caption font-medium text-foreground">
                {values[cluster]}%
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
