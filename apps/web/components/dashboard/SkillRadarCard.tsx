'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import type { SkillCluster, SkillValues } from '@/types'
import { SKILL_COLORS, SKILL_LABELS } from '@/lib/design/tokens'
import { SKILL_CLUSTER_IDS, ClusterBreakdown } from '@/lib/skillRadar'
import { Shield, Info } from 'lucide-react'

interface SkillRadarCardProps {
  skillValues: SkillValues
  breakdown: ClusterBreakdown[]
  overallScore: number
}

export function SkillRadarCard({
  skillValues,
  breakdown,
  overallScore,
}: SkillRadarCardProps) {
  const [hoveredCluster, setHoveredCluster] = useState<SkillCluster | null>(null)

  // Radar geometry calculations
  const size = 320
  const center = size / 2
  const radius = 110
  const totalAxes = SKILL_CLUSTER_IDS.length
  const angleStep = (2 * Math.PI) / totalAxes

  // Helper to calculate X,Y coordinates for a given index and value (0-100)
  const getCoordinates = (index: number, value: number) => {
    const angle = index * angleStep - Math.PI / 2
    const r = (value / 100) * radius
    return {
      x: center + r * Math.cos(angle),
      y: center + r * Math.sin(angle),
    }
  }

  // Generate polygon points string for background grid rings (25%, 50%, 75%, 100%)
  const getGridPoints = (percentage: number) => {
    return SKILL_CLUSTER_IDS.map((_, i) => {
      const { x, y } = getCoordinates(i, percentage)
      return `${x},${y}`
    }).join(' ')
  }

  // Generate polygon points string for user skill data
  const dataPoints = SKILL_CLUSTER_IDS.map((clusterId, i) => {
    const val = skillValues[clusterId] || 0
    const { x, y } = getCoordinates(i, Math.max(8, val))
    return `${x},${y}`
  }).join(' ')

  const hoveredData = hoveredCluster
    ? breakdown.find((b) => b.id === hoveredCluster)
    : null

  return (
    <div className="rounded-2xl border border-border bg-card p-6 md:p-8 shadow-sm space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-border pb-4">
        <div>
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-primary" />
            <h2 className="text-xl font-bold font-serif text-foreground">
              Competency Skill Radar
            </h2>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Real-time competency matrix across 7 Product Management domains.
          </p>
        </div>

        <div className="flex items-center gap-3 bg-secondary/50 border border-border px-4 py-2 rounded-xl">
          <span className="text-xs font-medium text-muted-foreground">
            Overall Competency
          </span>
          <span className="text-lg font-bold text-primary font-mono">
            {overallScore}%
          </span>
        </div>
      </div>

      {/* Hero Visual Area: SVG Radar + Active Tooltip */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-8 items-center">
        {/* SVG Radar Chart */}
        <div className="md:col-span-6 lg:col-span-7 flex justify-center items-center relative py-4">
          <svg
            width={size}
            height={size}
            className="overflow-visible max-w-full drop-shadow-sm"
            role="img"
            aria-label="PM Competency Skill Radar Chart"
          >
            {/* Concentric Grid Rings */}
            {[25, 50, 75, 100].map((ring) => (
              <polygon
                key={ring}
                points={getGridPoints(ring)}
                fill="none"
                stroke="currentColor"
                className="text-border/60 dark:text-border/40"
                strokeWidth="1"
                strokeDasharray={ring === 100 ? 'none' : '3 3'}
              />
            ))}

            {/* Axis Lines & Labels */}
            {SKILL_CLUSTER_IDS.map((clusterId, i) => {
              const outerPoint = getCoordinates(i, 100)
              const labelPoint = getCoordinates(i, 118)
              const isHovered = hoveredCluster === clusterId

              return (
                <g key={clusterId}>
                  <line
                    x1={center}
                    y1={center}
                    x2={outerPoint.x}
                    y2={outerPoint.y}
                    stroke="currentColor"
                    className="text-border/40"
                    strokeWidth="1"
                  />
                  {/* Axis Vertex Node */}
                  <circle
                    cx={outerPoint.x}
                    cy={outerPoint.y}
                    r="3"
                    className="fill-border"
                  />
                  {/* Label Text */}
                  <text
                    x={labelPoint.x}
                    y={labelPoint.y}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    className={`text-[11px] font-medium transition-colors cursor-pointer ${
                      isHovered
                        ? 'fill-primary font-bold scale-105'
                        : 'fill-muted-foreground hover:fill-foreground'
                    }`}
                    onClick={() => setHoveredCluster(clusterId)}
                    onMouseEnter={() => setHoveredCluster(clusterId)}
                    onMouseLeave={() => setHoveredCluster(null)}
                  >
                    {SKILL_LABELS[clusterId].split(' ')[0]}
                  </text>
                </g>
              )
            })}

            {/* User Data Polygon with Framer Motion Animation */}
            <motion.polygon
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.5, ease: 'easeOut' }}
              points={dataPoints}
              fill="currentColor"
              className="text-primary/20 dark:text-primary/30"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinejoin="round"
            />

            {/* Data Vertex Dots */}
            {SKILL_CLUSTER_IDS.map((clusterId, i) => {
              const val = skillValues[clusterId] || 0
              const pt = getCoordinates(i, Math.max(8, val))
              const isHovered = hoveredCluster === clusterId

              return (
                <circle
                  key={clusterId}
                  cx={pt.x}
                  cy={pt.y}
                  r={isHovered ? '6' : '4'}
                  fill={SKILL_COLORS[clusterId]}
                  className="transition-all cursor-pointer stroke-background stroke-2"
                  onMouseEnter={() => setHoveredCluster(clusterId)}
                  onMouseLeave={() => setHoveredCluster(null)}
                />
              )
            })}
          </svg>
        </div>

        {/* Hover / Active Cluster Detail Card */}
        <div className="md:col-span-6 lg:col-span-5 bg-secondary/30 border border-border/70 rounded-xl p-5 space-y-4">
          {hoveredData ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span
                  className="w-3 h-3 rounded-full inline-block"
                  style={{ backgroundColor: SKILL_COLORS[hoveredData.id] }}
                />
                <span className="text-xs font-semibold text-primary uppercase tracking-wider">
                  {hoveredData.level}
                </span>
              </div>
              <div>
                <h3 className="text-lg font-bold text-foreground">
                  {hoveredData.label}
                </h3>
                <p className="text-2xl font-extrabold text-primary font-mono mt-1">
                  {hoveredData.score}%
                </p>
              </div>
              <div className="text-xs text-muted-foreground space-y-1 border-t border-border/50 pt-2">
                <p>Lessons Completed: {hoveredData.completedLessons} / {hoveredData.totalLessons}</p>
                <p>Points Earned: {hoveredData.pointsEarned} / {hoveredData.maxPoints}</p>
              </div>
            </div>
          ) : (
            <div className="space-y-2 py-4 text-center md:text-left">
              <div className="inline-flex items-center gap-1.5 text-xs text-muted-foreground font-medium">
                <Info className="w-4 h-4 text-primary" />
                Hover over radar points to inspect competency metrics.
              </div>
              <p className="text-xs text-muted-foreground/80 leading-relaxed">
                Scores update automatically as you complete lessons, answer quizzes, and verify theory engagement.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Competency Breakdown Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 border-t border-border pt-6">
        {breakdown.map((item) => (
          <div
            key={item.id}
            className={`rounded-xl p-3.5 border transition-all cursor-pointer ${
              hoveredCluster === item.id
                ? 'border-primary bg-primary/5 shadow-sm'
                : 'border-border/60 bg-secondary/20 hover:border-border hover:bg-secondary/40'
            }`}
            onMouseEnter={() => setHoveredCluster(item.id)}
            onMouseLeave={() => setHoveredCluster(null)}
          >
            <div className="flex items-center justify-between mb-1.5">
              <span
                className="w-2.5 h-2.5 rounded-full"
                style={{ backgroundColor: SKILL_COLORS[item.id] }}
              />
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                {item.level}
              </span>
            </div>

            <span className="text-xs font-semibold text-foreground line-clamp-1">
              {item.label}
            </span>

            <div className="flex items-baseline justify-between mt-2">
              <span className="text-xl font-bold text-primary font-mono">
                {item.score}%
              </span>
              <span className="text-[10px] text-muted-foreground font-medium">
                {item.completedLessons}/{item.totalLessons} Lessons
              </span>
            </div>

            <div className="w-full bg-border rounded-full h-1.5 mt-2 overflow-hidden">
              <div
                className="h-1.5 rounded-full transition-all duration-500"
                style={{
                  width: `${item.score}%`,
                  backgroundColor: SKILL_COLORS[item.id],
                }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
