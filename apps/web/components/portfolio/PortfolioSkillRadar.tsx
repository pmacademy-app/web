'use client'

import React from 'react'
import { Target, Compass, Sparkles } from 'lucide-react'
import { getProficiencyLevel, type SkillRadarSummary } from '@/lib/skillRadar'

interface PortfolioSkillRadarProps {
  skillRadar: SkillRadarSummary
}

export function PortfolioSkillRadar({ skillRadar }: PortfolioSkillRadarProps) {
  const { breakdown, overallScore } = skillRadar
  const overallLevel = getProficiencyLevel(overallScore)

  return (
    <div className="rounded-2xl border border-border bg-card p-6 md:p-8 shadow-sm space-y-6">
      {/* Section Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-primary/10 text-primary">
            <Target className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-xl font-bold font-serif text-foreground">
              Competency Skill Radar
            </h2>
            <p className="text-xs text-muted-foreground">
              Continuous 0–100 mastery scores across 7 core Product Management clusters.
            </p>
          </div>
        </div>

        {/* Overall Score Badge */}
        <div className="flex items-center gap-2.5 px-4 py-2 rounded-xl bg-primary/10 border border-primary/20 self-start sm:self-auto">
          <Sparkles className="w-4 h-4 text-primary" />
          <div>
            <span className="text-[10px] uppercase font-bold text-muted-foreground block leading-tight">
              Overall Craft Score
            </span>
            <span className="text-sm font-bold text-foreground">
              {overallScore} / 100 ({overallLevel})
            </span>
          </div>
        </div>
      </div>

      {/* Cluster Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {breakdown.map((cluster) => {
          const isMaster = cluster.score >= 85
          const isAdvanced = cluster.score >= 60 && cluster.score < 85

          return (
            <div
              key={cluster.id}
              className="rounded-xl border border-border/80 bg-card/60 p-4 space-y-3 hover:border-primary/40 transition-colors"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold text-foreground capitalize flex items-center gap-1.5">
                  <Compass className="w-3.5 h-3.5 text-primary" />
                  {cluster.label}
                </span>
                <span
                  className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                    isMaster
                      ? 'bg-amber-500/10 text-amber-500 border border-amber-500/20'
                      : isAdvanced
                      ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20'
                      : 'bg-secondary text-muted-foreground'
                  }`}
                >
                  {cluster.level}
                </span>
              </div>

              {/* Progress Bar */}
              <div className="space-y-1">
                <div className="flex justify-between items-center text-[11px] font-mono">
                  <span className="text-muted-foreground">Score</span>
                  <span className="font-bold text-foreground">{cluster.score} / 100</span>
                </div>
                <div className="w-full h-2 rounded-full bg-secondary overflow-hidden">
                  <div
                    className="h-full bg-primary transition-all duration-500 rounded-full"
                    style={{ width: `${Math.min(100, Math.max(5, cluster.score))}%` }}
                  />
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
