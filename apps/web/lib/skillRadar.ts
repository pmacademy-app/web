import type { SkillCluster, SkillValues } from '@/types'
import { SKILL_LABELS } from '@/lib/design/tokens'

/** Canonical ordered list of skill cluster IDs. */
export const SKILL_CLUSTER_IDS: SkillCluster[] = [
  'discovery', 'strategy', 'design', 'execution',
  'growth', 'leadership', 'technical',
]

/** Enriched cluster objects with labels — use for UI rendering. */
export const SKILL_CLUSTERS: { id: SkillCluster; label: string }[] =
  SKILL_CLUSTER_IDS.map((id) => ({ id, label: SKILL_LABELS[id] }))

export interface LessonProgressInput {
  lessonSlug: string
  status: 'not_started' | 'in_progress' | 'completed'
  quizScore: number | null // 0 to 100
  skillClusters: SkillCluster[]
}

/**
 * Calculates continuous 0–100 scores across all 7 skill clusters based on user progress.
 */
export function calculateSkillRadarScores(
  userProgressList: LessonProgressInput[]
): SkillValues {
  const scores: Record<SkillCluster, { points: number; maxPoints: number }> = {
    discovery:  { points: 0, maxPoints: 0 },
    strategy:   { points: 0, maxPoints: 0 },
    design:     { points: 0, maxPoints: 0 },
    execution:  { points: 0, maxPoints: 0 },
    growth:     { points: 0, maxPoints: 0 },
    leadership: { points: 0, maxPoints: 0 },
    technical:  { points: 0, maxPoints: 0 },
  }

  for (const progress of userProgressList) {
    if (!progress.skillClusters || progress.skillClusters.length === 0) continue

    for (const cluster of progress.skillClusters) {
      if (!scores[cluster]) continue

      // Each tagged lesson contributes up to 100 points to its cluster
      scores[cluster].maxPoints += 100

      if (progress.status === 'completed') {
        const quizComponent = progress.quizScore ?? 80
        const lessonScore = 0.5 * 100 + 0.5 * quizComponent
        scores[cluster].points += lessonScore
      } else if (progress.status === 'in_progress') {
        scores[cluster].points += 25
      }
    }
  }

  const result: SkillValues = {
    discovery:  0,
    strategy:   0,
    design:     0,
    execution:  0,
    growth:     0,
    leadership: 0,
    technical:  0,
  }

  for (const cluster of Object.keys(scores) as SkillCluster[]) {
    const data = scores[cluster]
    if (data.maxPoints > 0) {
      result[cluster] = Math.min(100, Math.round((data.points / data.maxPoints) * 100))
    } else {
      result[cluster] = 0
    }
  }

  return result
}
