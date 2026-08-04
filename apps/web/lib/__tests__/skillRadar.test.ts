import { describe, it } from 'node:test'
import assert from 'node:assert'
import {
  calculateSkillRadarScores,
  calculateOverallCompetency,
  getCompetencyBreakdown,
  getLessonContribution,
  normalizeScore,
  getProficiencyLevel,
  SKILL_CLUSTER_IDS,
  LessonProgressInput,
} from '../skillRadar'

describe('PM Academy Skill Radar Engine Test Suite', () => {
  describe('Lesson Contribution Scoring Formula', () => {
    it('returns 0 points for not_started lessons', () => {
      assert.strictEqual(getLessonContribution('not_started'), 0)
    })

    it('returns 20 points for in_progress lessons', () => {
      assert.strictEqual(getLessonContribution('in_progress'), 20)
    })

    it('returns 80 points for completed lesson with 80% quiz score (non-first-attempt)', () => {
      // 40 (theory) + 40 (50% of 80) = 80 points
      const points = getLessonContribution('completed', 80, 2)
      assert.strictEqual(points, 80)
    })

    it('returns full 100 points for first-attempt 100% perfect quiz score', () => {
      // 40 (theory) + 50 (quiz 100%) + 10 (perfect first-attempt bonus) = 100 points
      const points = getLessonContribution('completed', 100, 1)
      assert.strictEqual(points, 100)
    })

    it('clamps quiz score input safely between 0 and 100', () => {
      const pointsHigh = getLessonContribution('completed', 150, 2)
      assert.strictEqual(pointsHigh, 90) // 40 + 50 = 90
    })
  })

  describe('Score Normalization & Levels', () => {
    it('clamps scores strictly between 0 and 100', () => {
      assert.strictEqual(normalizeScore(-20), 0)
      assert.strictEqual(normalizeScore(150), 100)
      assert.strictEqual(normalizeScore(74.4), 74)
      assert.strictEqual(normalizeScore(NaN), 0)
    })

    it('returns correct proficiency levels', () => {
      assert.strictEqual(getProficiencyLevel(15), 'Beginner')
      assert.strictEqual(getProficiencyLevel(45), 'Intermediate')
      assert.strictEqual(getProficiencyLevel(75), 'Advanced')
      assert.strictEqual(getProficiencyLevel(90), 'Master')
    })
  })

  describe('Skill Radar Aggregation across 7 Competency Clusters', () => {
    it('returns 0 for all 7 clusters when user has no progress', () => {
      const scores = calculateSkillRadarScores([])
      for (const cluster of SKILL_CLUSTER_IDS) {
        assert.strictEqual(scores[cluster], 0)
      }
      assert.strictEqual(calculateOverallCompetency(scores), 0)
    })

    it('accurately calculates scores for mapped module lessons', () => {
      const userProgress: LessonProgressInput[] = [
        {
          lessonId: 'les_001',
          moduleSlug: 'discovery-and-research',
          status: 'completed',
          quizScore: 100,
          quizAttempts: 1, // 100 points
        },
      ]

      const scores = calculateSkillRadarScores(userProgress)
      // Discovery cluster maxPoints = 10 * 100 = 1000 points. 100 points earned = 10%
      assert.strictEqual(scores.discovery, 10)
      assert.strictEqual(scores.strategy, 0)
    })

    it('calculates overall competency score correctly', () => {
      const mockScores = {
        discovery: 80,
        strategy: 60,
        design: 70,
        execution: 50,
        growth: 90,
        leadership: 40,
        technical: 30,
      }

      // Sum = 420 / 7 = 60
      assert.strictEqual(calculateOverallCompetency(mockScores), 60)
    })
  })

  describe('Competency Breakdown Details', () => {
    it('returns enriched breakdown array for all 7 clusters', () => {
      const breakdown = getCompetencyBreakdown([])
      assert.strictEqual(breakdown.length, 7)

      const clusterIds = breakdown.map((b) => b.id)
      assert.deepStrictEqual(clusterIds, SKILL_CLUSTER_IDS)

      for (const item of breakdown) {
        assert.strictEqual(typeof item.label, 'string')
        assert.strictEqual(typeof item.score, 'number')
        assert.strictEqual(typeof item.level, 'string')
        assert.strictEqual(item.score, 0)
        assert.strictEqual(item.level, 'Beginner')
      }
    })
  })
})
