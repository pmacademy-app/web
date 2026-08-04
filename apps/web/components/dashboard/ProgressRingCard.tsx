'use client'

import { motion } from 'framer-motion'
import { GraduationCap, CheckCircle } from 'lucide-react'

interface ProgressRingCardProps {
  completedLessons: number
  totalLessons?: number
  completedModules?: number
  totalModules?: number
}

export function ProgressRingCard({
  completedLessons,
  totalLessons = 90,
  completedModules = 0,
  totalModules = 9,
}: ProgressRingCardProps) {
  const percentage = Math.min(
    100,
    Math.round((completedLessons / totalLessons) * 100)
  )

  const radius = 42
  const stroke = 8
  const normalizedRadius = radius - stroke * 2
  const circumference = normalizedRadius * 2 * Math.PI
  const strokeDashoffset = circumference - (percentage / 100) * circumference

  return (
    <div className="rounded-2xl border border-border bg-card p-6 shadow-sm flex flex-col justify-between space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <GraduationCap className="w-5 h-5 text-primary" />
          <h3 className="text-sm font-bold font-serif text-foreground">
            Curriculum Progress
          </h3>
        </div>
        <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-primary/10 text-primary">
          {percentage}% Complete
        </span>
      </div>

      <div className="flex items-center justify-between gap-4 my-2">
        {/* SVG Radial Progress Ring */}
        <div className="relative flex items-center justify-center">
          <svg height={radius * 2} width={radius * 2} className="-rotate-90">
            <circle
              stroke="currentColor"
              className="text-border"
              fill="transparent"
              strokeWidth={stroke}
              r={normalizedRadius}
              cx={radius}
              cy={radius}
            />
            <motion.circle
              stroke="currentColor"
              className="text-primary"
              fill="transparent"
              strokeWidth={stroke}
              strokeDasharray={`${circumference} ${circumference}`}
              initial={{ strokeDashoffset: circumference }}
              animate={{ strokeDashoffset }}
              transition={{ duration: 1, ease: 'easeOut' }}
              strokeLinecap="round"
              r={normalizedRadius}
              cx={radius}
              cy={radius}
            />
          </svg>
          <span className="absolute text-sm font-extrabold text-foreground font-mono">
            {percentage}%
          </span>
        </div>

        {/* Breakdown Stats */}
        <div className="space-y-2 flex-1">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground font-medium">Lessons:</span>
            <span className="font-bold text-foreground font-mono">
              {completedLessons} / {totalLessons}
            </span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground font-medium">Modules:</span>
            <span className="font-bold text-foreground font-mono">
              {completedModules} / {totalModules}
            </span>
          </div>
          <div className="w-full bg-secondary rounded-full h-1.5 overflow-hidden mt-1">
            <div
              className="bg-primary h-1.5 rounded-full transition-all duration-500"
              style={{ width: `${percentage}%` }}
            />
          </div>
        </div>
      </div>

      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground border-t border-border/50 pt-3">
        <CheckCircle className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
        <span>
          {totalLessons - completedLessons} lessons remaining to finish PM Academy.
        </span>
      </div>
    </div>
  )
}
