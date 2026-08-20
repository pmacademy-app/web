import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase'
import type { SkillCluster, SkillValues } from '@/types'
import { SKILL_LABELS } from '@/lib/design/tokens'

/**
 * Configurable weights for continuous 0–100 Skill Radar scoring model.
 * Documented per PRD.md §4.8, §11.
 */
export const RADAR_WEIGHTS = {
  THEORY_COMPLETION_WEIGHT: 0.4, // 40 points out of 100 per lesson
  QUIZ_PERFORMANCE_WEIGHT: 0.5, // Up to 50 points out of 100 per lesson based on quiz score %
  PERFECT_QUIZ_BONUS_WEIGHT: 0.1, // 10 bonus points for 100% first attempt
  IN_PROGRESS_WEIGHT: 0.2, // 20 points for in-progress lessons
} as const

interface DBChain {
  [method: string]: (...args: unknown[]) => DBChain & Promise<{ data: unknown; error: unknown }>
}

/** Canonical ordered list of skill cluster IDs. */
export const SKILL_CLUSTER_IDS: SkillCluster[] = [
  'discovery',
  'strategy',
  'design',
  'execution',
  'growth',
  'leadership',
  'technical',
]

/** Enriched cluster objects with labels — use for UI rendering. */
export const SKILL_CLUSTERS: { id: SkillCluster; label: string }[] =
  SKILL_CLUSTER_IDS.map((id) => ({ id, label: SKILL_LABELS[id] }))

/** Module slug to primary skill clusters mapping (1–2 clusters per module). */
export const MODULE_SKILL_CLUSTERS: Record<string, SkillCluster[]> = {
  foundations: ['leadership', 'technical'],
  'discovery-and-research': ['discovery'],
  discovery: ['discovery'],
  'product-strategy': ['strategy'],
  strategy: ['strategy'],
  'design-and-ux': ['design'],
  design: ['design'],
  'prd-and-specs': ['execution', 'technical'],
  prd: ['execution', 'technical'],
  'execution-and-delivery': ['execution'],
  execution: ['execution'],
  'metrics-and-growth': ['growth'],
  metrics: ['growth'],
  'leadership-and-communication': ['leadership'],
  leadership: ['leadership'],
  'tech-for-pms': ['technical'],
  tech: ['technical'],
}

export interface LessonProgressInput {
  lessonId?: string
  lessonSlug?: string
  moduleSlug?: string
  status: 'not_started' | 'in_progress' | 'completed'
  quizScore?: number | null // 0 to 100
  quizAttempts?: number
  skillClusters?: SkillCluster[]
}

export interface ClusterBreakdown {
  id: SkillCluster
  label: string
  score: number // 0 to 100
  level: 'Beginner' | 'Intermediate' | 'Advanced' | 'Master'
  completedLessons: number
  totalLessons: number
  maxPoints: number
  pointsEarned: number
}

export interface SkillRadarSummary {
  scores: SkillValues
  overallScore: number
  breakdown: ClusterBreakdown[]
}

/**
 * Normalizes and clamps any raw score strictly between 0 and 100.
 */
export function normalizeScore(score: number): number {
  if (isNaN(score) || !isFinite(score)) return 0
  return Math.min(100, Math.max(0, Math.round(score)))
}

/**
 * Calculates score contribution (0–100 points) for a single lesson based on completion & quiz performance.
 */
export function getLessonContribution(
  status: 'not_started' | 'in_progress' | 'completed',
  quizScore: number | null = null,
  quizAttempts: number = 0
): number {
  if (status === 'not_started') {
    return 0
  }

  if (status === 'in_progress') {
    return RADAR_WEIGHTS.IN_PROGRESS_WEIGHT * 100 // 20 points
  }

  // Completed lesson
  const theoryPoints = RADAR_WEIGHTS.THEORY_COMPLETION_WEIGHT * 100 // 40 points
  const normalizedQuiz = Math.min(100, Math.max(0, quizScore ?? 80))
  const quizPoints = (normalizedQuiz / 100) * (RADAR_WEIGHTS.QUIZ_PERFORMANCE_WEIGHT * 100) // Up to 50 points

  const isPerfectFirstAttempt = quizAttempts === 1 && normalizedQuiz === 100
  const bonusPoints = isPerfectFirstAttempt
    ? RADAR_WEIGHTS.PERFECT_QUIZ_BONUS_WEIGHT * 100 // 10 points
    : 0

  return Math.min(100, Math.round(theoryPoints + quizPoints + bonusPoints))
}

/**
 * Resolves target skill clusters for a lesson from explicit metadata or module fallback.
 */
export function resolveLessonClusters(
  progress: LessonProgressInput
): SkillCluster[] {
  if (progress.skillClusters && progress.skillClusters.length > 0) {
    return progress.skillClusters
  }

  if (progress.moduleSlug && MODULE_SKILL_CLUSTERS[progress.moduleSlug]) {
    return MODULE_SKILL_CLUSTERS[progress.moduleSlug]
  }

  // Default fallback if unknown
  return ['strategy']
}

/**
 * Calculates continuous 0–100 scores across all 7 skill clusters based on user progress.
 */
export function calculateSkillRadarScores(
  userProgressList: LessonProgressInput[]
): SkillValues {
  const pointsMap: Record<SkillCluster, { points: number; maxPoints: number }> = {
    discovery: { points: 0, maxPoints: 0 },
    strategy: { points: 0, maxPoints: 0 },
    design: { points: 0, maxPoints: 0 },
    execution: { points: 0, maxPoints: 0 },
    growth: { points: 0, maxPoints: 0 },
    leadership: { points: 0, maxPoints: 0 },
    technical: { points: 0, maxPoints: 0 },
  }

  // Pre-seed default maxPoints for curriculum balance (e.g. ~10–25 lessons per cluster across 90 lessons)
  const clusterLessonCounts: Record<SkillCluster, number> = {
    discovery: 10,
    strategy: 20,
    design: 10,
    execution: 20,
    growth: 10,
    leadership: 20,
    technical: 20,
  }

  for (const cluster of SKILL_CLUSTER_IDS) {
    pointsMap[cluster].maxPoints = clusterLessonCounts[cluster] * 100
  }

  for (const progress of userProgressList) {
    const clusters = resolveLessonClusters(progress)
    const contribution = getLessonContribution(
      progress.status,
      progress.quizScore ?? null,
      progress.quizAttempts ?? 0
    )

    for (const cluster of clusters) {
      if (pointsMap[cluster]) {
        pointsMap[cluster].points += contribution
      }
    }
  }

  const result: SkillValues = {
    discovery: 0,
    strategy: 0,
    design: 0,
    execution: 0,
    growth: 0,
    leadership: 0,
    technical: 0,
  }

  for (const cluster of SKILL_CLUSTER_IDS) {
    const data = pointsMap[cluster]
    if (data.maxPoints > 0) {
      result[cluster] = normalizeScore((data.points / data.maxPoints) * 100)
    }
  }

  return result
}

/**
 * Calculates overall curriculum competency score (0–100 average).
 */
export function calculateOverallCompetency(skillValues: SkillValues): number {
  const clusters = SKILL_CLUSTER_IDS
  const totalSum = clusters.reduce((sum, c) => sum + (skillValues[c] || 0), 0)
  return Math.round(totalSum / clusters.length)
}

/**
 * Converts a 0–100 score into a human-readable proficiency level.
 */
export function getProficiencyLevel(score: number): 'Beginner' | 'Intermediate' | 'Advanced' | 'Master' {
  if (score >= 85) return 'Master'
  if (score >= 60) return 'Advanced'
  if (score >= 30) return 'Intermediate'
  return 'Beginner'
}

/**
 * Generates detailed cluster breakdown metrics for frontend visualization & tooltips.
 */
export function getCompetencyBreakdown(
  userProgressList: LessonProgressInput[]
): ClusterBreakdown[] {
  const scores = calculateSkillRadarScores(userProgressList)
  
  const completedCounts: Record<SkillCluster, number> = {
    discovery: 0,
    strategy: 0,
    design: 0,
    execution: 0,
    growth: 0,
    leadership: 0,
    technical: 0,
  }

  const totalCounts: Record<SkillCluster, number> = {
    discovery: 10,
    strategy: 20,
    design: 10,
    execution: 20,
    growth: 10,
    leadership: 20,
    technical: 20,
  }

  for (const progress of userProgressList) {
    if (progress.status === 'completed') {
      const clusters = resolveLessonClusters(progress)
      for (const cluster of clusters) {
        if (completedCounts[cluster] !== undefined) {
          completedCounts[cluster] += 1
        }
      }
    }
  }

  return SKILL_CLUSTER_IDS.map((cluster) => {
    const score = scores[cluster]
    return {
      id: cluster,
      label: SKILL_LABELS[cluster],
      score,
      level: getProficiencyLevel(score),
      completedLessons: completedCounts[cluster],
      totalLessons: totalCounts[cluster],
      maxPoints: totalCounts[cluster] * 100,
      pointsEarned: Math.round((score / 100) * (totalCounts[cluster] * 100)),
    }
  })
}

/**
 * Service function: Retrieves real-time Skill Radar summary for a user from database progress.
 */
export async function getSkillRadarSummary(
  supabase: SupabaseClient<Database>,
  userId: string
): Promise<SkillRadarSummary> {
  const { data: progressRows, error } = (await (supabase
    .from('user_lesson_progress') as unknown as DBChain)
    .select('lesson_id, status, quiz_score, quiz_attempts')
    .eq('user_id', userId)) as unknown as {
    data: { lesson_id: string; status: 'not_started' | 'in_progress' | 'completed'; quiz_score: number | null; quiz_attempts: number }[] | null
    error: unknown
  }

  if (error) {
    console.error('[skillRadar] Error fetching user_lesson_progress for skill radar:', error)
  }

  let lessonModuleMap = new Map<string, string>()
  try {
    if (typeof window === 'undefined') {
      const fs = await import('fs/promises')
      const path = await import('path')
      const curriculumPath = path.default.resolve(process.cwd(), '..', '..', 'content', 'dist', 'curriculum.json')
      const raw = await fs.readFile(curriculumPath, 'utf-8')
      const curriculum = JSON.parse(raw)
      for (const l of curriculum.lessons) {
        lessonModuleMap.set(l.id, l.module)
      }
    }
  } catch (e) {
    console.warn('[skillRadar] Could not load curriculum.json for lesson mapping')
  }

  const userProgressList: LessonProgressInput[] = (progressRows || []).map((row) => ({
    lessonId: row.lesson_id,
    moduleSlug: lessonModuleMap.get(row.lesson_id),
    status: row.status,
    quizScore: row.quiz_score,
    quizAttempts: row.quiz_attempts,
  }))

  const scores = calculateSkillRadarScores(userProgressList)
  const overallScore = calculateOverallCompetency(scores)
  const breakdown = getCompetencyBreakdown(userProgressList)

  return {
    scores,
    overallScore,
    breakdown,
  }
}

/**
 * Backend foundation: Calculates historical competency growth over completed modules.
 * Prepares data layer for future progress over time graphs.
 */
export async function getSkillRadarHistory(
  supabase: SupabaseClient<Database>,
  userId: string
): Promise<{ timestamp: string; overallScore: number; scores: SkillValues }[]> {
  const summary = await getSkillRadarSummary(supabase, userId)
  return [
    {
      timestamp: new Date().toISOString(),
      overallScore: summary.overallScore,
      scores: summary.scores,
    },
  ]
}

