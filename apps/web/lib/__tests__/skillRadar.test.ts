import { describe, it, expect } from 'vitest'
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
      expect(getLessonContribution('not_started')).toBe(0)
    })

    it('returns 20 points for in_progress lessons', () => {
      expect(getLessonContribution('in_progress')).toBe(20)
    })

    it('returns 80 points for completed lesson with 80% quiz score (non-first-attempt)', () => {
      const points = getLessonContribution('completed', 80, 2)
      expect(points).toBe(80)
    })

    it('returns full 100 points for first-attempt 100% perfect quiz score', () => {
      const points = getLessonContribution('completed', 100, 1)
      expect(points).toBe(100)
    })

    it('clamps quiz score input safely between 0 and 100', () => {
      const pointsHigh = getLessonContribution('completed', 150, 2)
      expect(pointsHigh).toBe(90)
    })
  })

  describe('Score Normalization & Levels', () => {
    it('clamps scores strictly between 0 and 100', () => {
      expect(normalizeScore(-20)).toBe(0)
      expect(normalizeScore(150)).toBe(100)
      expect(normalizeScore(74.4)).toBe(74)
      expect(normalizeScore(NaN)).toBe(0)
    })

    it('returns correct proficiency levels', () => {
      expect(getProficiencyLevel(15)).toBe('Beginner')
      expect(getProficiencyLevel(45)).toBe('Intermediate')
      expect(getProficiencyLevel(75)).toBe('Advanced')
      expect(getProficiencyLevel(90)).toBe('Master')
    })
  })

  describe('Skill Radar Aggregation across 7 Competency Clusters', () => {
    it('returns 0 for all 7 clusters when user has no progress', () => {
      const scores = calculateSkillRadarScores([])
      for (const cluster of SKILL_CLUSTER_IDS) {
        expect(scores[cluster]).toBe(0)
      }
      expect(calculateOverallCompetency(scores)).toBe(0)
    })

    it('accurately calculates scores for mapped module lessons', () => {
      const userProgress: LessonProgressInput[] = [
        {
          lessonId: 'les_001',
          moduleSlug: 'discovery-and-research',
          status: 'completed',
          quizScore: 100,
          quizAttempts: 1,
        },
      ]

      const scores = calculateSkillRadarScores(userProgress)
      expect(scores.discovery).toBe(10)
      expect(scores.strategy).toBe(0)
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

      expect(calculateOverallCompetency(mockScores)).toBe(60)
    })
  })

  describe('Competency Breakdown Details', () => {
    it('returns enriched breakdown array for all 7 clusters', () => {
      const breakdown = getCompetencyBreakdown([])
      expect(breakdown.length).toBe(7)

      const clusterIds = breakdown.map((b) => b.id)
      expect(clusterIds).toEqual(SKILL_CLUSTER_IDS)

      for (const item of breakdown) {
        expect(typeof item.label).toBe('string')
        expect(typeof item.score).toBe('number')
        expect(typeof item.level).toBe('string')
        expect(item.score).toBe(0)
        expect(item.level).toBe('Beginner')
      }
    })
  })
})
