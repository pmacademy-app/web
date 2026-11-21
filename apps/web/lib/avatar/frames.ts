import { calculateLevel } from '@/lib/xp/xp'

/**
 * Avatar frames: earned rings around a learner's avatar. Every frame comes from data
 * Prodily already holds, so a frame always tells the truth about the learner.
 *
 * Motion has a job (components/avatar/AvatarFrame.tsx):
 *   moment  plays once when a frame or its value is new (level ring fills, seal pops)
 *   live    a pulse while the learner is studying right now
 *   idle    a slow loop, only on the rare frames (PM Fellow, weekly top 3)
 *   calm    everything stops under prefers-reduced-motion
 */
export type FrameKind = 'level' | 'streak' | 'verified' | 'certified' | 'top3' | 'fellow'

/** Highest first: the default frame is the first earned one in this order. */
export const FRAME_PRIORITY: readonly FrameKind[] = ['fellow', 'top3', 'certified', 'verified', 'streak', 'level']

/** A streak frame needs this many days in a row, so one day of study does not replace the level ring. */
export const STREAK_FRAME_MIN_DAYS = 3

export interface FrameSignals {
  totalXp?: number | null
  currentStreak?: number | null
  /** True when today's study already counted toward the streak. */
  studiedToday?: boolean
  isFellow?: boolean
  isPortfolioVerified?: boolean
  hasFullCertificate?: boolean
  /** This week's leaderboard rank, when ranked. */
  weeklyRank?: number | null
}

export interface ResolvedFrame {
  kind: FrameKind
  level: number
  /** 0..1 progress toward the next level. */
  levelProgress: number
  /** Days in a row, capped at 7 for the ring's segments. */
  streakSegments: number
  studiedToday: boolean
  weeklyRank: number | null
}

/** Every frame the learner has earned, highest first. The level ring is always earned. */
export function earnedFrames(signals: FrameSignals): FrameKind[] {
  const earned = new Set<FrameKind>(['level'])
  if (signals.isFellow) earned.add('fellow')
  if (signals.weeklyRank != null && signals.weeklyRank >= 1 && signals.weeklyRank <= 3) earned.add('top3')
  if (signals.hasFullCertificate) earned.add('certified')
  if (signals.isPortfolioVerified) earned.add('verified')
  if ((signals.currentStreak ?? 0) >= STREAK_FRAME_MIN_DAYS) earned.add('streak')
  return FRAME_PRIORITY.filter((kind) => earned.has(kind))
}

/**
 * The frame to show: the learner's chosen one when they still hold it, otherwise the
 * highest earned. A chosen frame that is no longer earned (a lapsed streak, last week's
 * rank) falls back instead of showing something untrue.
 */
export function resolveFrame(signals: FrameSignals, chosen?: string | null): ResolvedFrame {
  const earned = earnedFrames(signals)
  const kind = chosen && earned.includes(chosen as FrameKind) ? (chosen as FrameKind) : earned[0]
  const info = calculateLevel(Math.max(0, Number(signals.totalXp ?? 0)))
  return {
    kind,
    level: info.level,
    levelProgress: Math.min(1, Math.max(0, info.progressRatio ?? 0)),
    streakSegments: Math.min(7, Math.max(0, Number(signals.currentStreak ?? 0))),
    studiedToday: Boolean(signals.studiedToday),
    weeklyRank: signals.weeklyRank ?? null,
  }
}

export const FRAME_LABELS: Record<FrameKind, string> = {
  level: 'Level ring',
  streak: 'Streak ring',
  verified: 'Verified portfolio',
  certified: 'Certified',
  top3: 'Weekly top 3',
  fellow: 'PM Fellow',
}

/** Every frame kind, for validating a chosen frame. */
export const FRAME_KINDS = ['level', 'streak', 'verified', 'certified', 'top3', 'fellow'] as const

/**
 * Frames a learner may pick in Settings. The level ring always; the streak ring and the
 * Fellow frame once earned. Verified, certified and weekly top 3 are shown automatically
 * when earned, since checking them needs data the picker does not load.
 */
export function choosableFrames(signals: Pick<FrameSignals, 'currentStreak' | 'isFellow'>): FrameKind[] {
  const out: FrameKind[] = []
  if (signals.isFellow) out.push('fellow')
  if ((signals.currentStreak ?? 0) >= STREAK_FRAME_MIN_DAYS) out.push('streak')
  out.push('level')
  return out
}
