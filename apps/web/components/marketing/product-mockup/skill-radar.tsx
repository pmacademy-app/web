import { SKILL_COLORS, SKILL_LABELS } from '@/lib/design/tokens'
import { SKILL_CLUSTER_IDS } from '@/lib/skillRadar'
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
 * 7 axes, competency colors, ghost polygon, CSS entry animation.
 * Screen-reader accessible via text summary.
 *
 * ## B12-B — server component
 *
 * This rendered inside the landing hero and was one of the imports holding
 * framer-motion on the critical path (B12-A: 171.7 KB gzip). The animation it needed
 * was an opacity fade on the polygon and a staggered fade on seven dots, gated on
 * `useInView` — but on the landing page it sits in the hero and is in view on mount,
 * so the observer only ever delayed it. Both are now `animate-in` CSS with per-dot
 * `animation-delay`, which removes the client boundary entirely: no `'use client'`,
 * no hooks, no engine. `motion-reduce:animate-none` replaces the `prefersReducedMotion`
 * branch.
 */
export function SkillRadar({
  values,
  previousValues,
  size = DEFAULT_SIZE,
  showLegend = true,
  className,
}: SkillRadarProps) {
  const cx = size / 2
  const cy = size / 2
  const maxRadius = (size / 2) * 0.75
  const gridLevels = 4
  const clusterCount = SKILL_CLUSTER_IDS.length

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
    return SKILL_CLUSTER_IDS.map((cluster, i) => {
      const point = getPoint(i, vals[cluster])
      return `${point.x},${point.y}`
    }).join(' ')
  }

  return (
    <div className={cn('flex flex-col gap-6', className)}>
      {/* Screen-reader text summary */}
      <p className="sr-only">
        Skill radar showing PM Academy progress across 7 competencies:{' '}
        {SKILL_CLUSTER_IDS.map((c) => `${SKILL_LABELS[c]}: ${values[c]}%`).join(', ')}.
      </p>

      {/* SVG Radar */}
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        aria-hidden="true"
        className="overflow-visible"
      >
        {/* Grid rings */}
        {Array.from({ length: gridLevels }, (_, i) => {
          const r = ((i + 1) / gridLevels) * maxRadius
          const ringPoints = SKILL_CLUSTER_IDS.map((_, ci) => {
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
        {SKILL_CLUSTER_IDS.map((_, i) => {
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
        {SKILL_CLUSTER_IDS.map((cluster, i) => {
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
        <polygon
          points={buildPolygon(values)}
          fill="var(--color-primary)"
          fillOpacity={0.15}
          stroke="var(--color-primary)"
          strokeWidth="2"
          strokeLinejoin="round"
          className="animate-in fade-in duration-[600ms] delay-200 fill-mode-both motion-reduce:animate-none"
        />

        {/* Value dots */}
        {SKILL_CLUSTER_IDS.map((cluster, i) => {
          const point = getPoint(i, values[cluster])
          return (
            <circle
              key={cluster}
              cx={point.x}
              cy={point.y}
              r="5"
              fill={SKILL_COLORS[cluster]}
              className="animate-in fade-in zoom-in duration-300 fill-mode-both motion-reduce:animate-none"
              style={{
                transformOrigin: `${point.x}px ${point.y}px`,
                animationDelay: `${400 + i * 50}ms`,
              }}
            />
          )
        })}
      </svg>

      {/* Legend */}
      {showLegend && (
        <div className="grid grid-cols-1 gap-2" aria-hidden="true">
          {SKILL_CLUSTER_IDS.map((cluster) => (
            <div key={cluster} className="flex items-center gap-2">
              <div
                className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                style={{ backgroundColor: SKILL_COLORS[cluster] }}
              />
              <span className="text-body-sm text-ink-muted">{SKILL_LABELS[cluster]}</span>
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
