/**
 * Pure summaries for the extra row of the dashboard "Portfolio & Proof" card (Growth R4,
 * tasks A6–A8): PM Fellow status, earned badges, and level progress.
 *
 * Client-safe and side-effect free, like `proof-card.ts`. The server loads the inputs and
 * passes these primitives to the card; `null` for any of them means "could not load", and
 * the card hides that cell rather than guessing.
 */
import { calculateLevel } from '@/lib/xp/xp'
import type { FellowRequestUiState } from '@/lib/fellow'
import type { PortfolioReadinessSummary } from '@/lib/portfolio-readiness'

export interface FellowSummary {
  state: FellowRequestUiState
  /** Share of the portfolio readiness checklist that is complete, 0–100. */
  readinessPercent: number
}

export interface BadgeSummary {
  earned: number
  total: number
  /** Name of the most recently earned badge, or null when none is earned. */
  latestName: string | null
}

export interface LevelSummary {
  level: number
  title: string
  /** XP still needed for the next level; 0 at the top level. */
  xpRemaining: number
  isMaxLevel: boolean
}

/** The proof card lower row's data. null in any field: could not load, so that cell is hidden. */
export interface ProofExtras {
  fellow: FellowSummary | null
  badges: BadgeSummary | null
  level: LevelSummary | null
  /** The live referral reward (admin-configurable); absent means the standard reward. */
  referralRewardXp?: number
}

export function summarizeFellow(input: {
  state: FellowRequestUiState
  readiness: Pick<PortfolioReadinessSummary, 'completedCount' | 'totalCount'>
}): FellowSummary {
  const { completedCount, totalCount } = input.readiness
  const readinessPercent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0
  return { state: input.state, readinessPercent: Math.min(100, Math.max(0, readinessPercent)) }
}

/** Reduces the /badges payload, so the dashboard counts exactly what /badges shows. */
export function summarizeBadges(payload: {
  totalEarned: number
  totalAvailable: number
  recentBadge: { definition: { name: string } } | null
}): BadgeSummary {
  return {
    earned: payload.totalEarned,
    total: payload.totalAvailable,
    latestName: payload.recentBadge?.definition.name ?? null,
  }
}

export function summarizeLevel(totalXp: number | null | undefined): LevelSummary {
  const info = calculateLevel(Number(totalXp) || 0)
  const isMaxLevel = info.nextLevelMinXp === info.currentLevelMinXp
  return { level: info.level, title: info.title, xpRemaining: info.xpRemaining, isMaxLevel }
}
