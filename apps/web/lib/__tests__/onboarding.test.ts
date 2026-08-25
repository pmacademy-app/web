import { describe, it, expect } from 'vitest'
import {
  DEFAULT_GOAL_OPTIONS,
  DEFAULT_EXPERIENCE_OPTIONS,
  DEFAULT_TOPIC_OPTIONS,
  DEFAULT_PREFERENCE_OPTIONS,
  DEFAULT_ONBOARDING_STEPS,
} from '@/lib/admin/settings-service'
import { CURRICULUM_MODULE_META } from '@/lib/admin/curriculum-meta'

describe('Onboarding Architecture & Recommendation Engine', () => {
  describe('Default Configuration Invariants', () => {
    it('provides exactly 4 default steps covering all onboarding phases', () => {
      expect(DEFAULT_ONBOARDING_STEPS).toHaveLength(4)
      expect(DEFAULT_ONBOARDING_STEPS.map((s) => s.id)).toEqual([
        'step_profile',
        'step_background',
        'step_interests',
        'step_path',
      ])
    })

    it('defines the exact 4 Step 2 Experience Level options with stable IDs', () => {
      expect(DEFAULT_EXPERIENCE_OPTIONS).toHaveLength(4)
      expect(DEFAULT_EXPERIENCE_OPTIONS.map((e) => ({ id: e.id, label: e.label }))).toEqual([
        { id: 'beginner', label: 'Beginner' },
        { id: 'learning', label: 'Learning Product Management' },
        { id: 'working', label: 'Working in Product' },
        { id: 'experienced', label: 'Experienced Product Manager' },
      ])
    })

    it('defines the exact 5 Step 2 Primary Goal options with stable IDs', () => {
      expect(DEFAULT_GOAL_OPTIONS).toHaveLength(5)
      expect(DEFAULT_GOAL_OPTIONS.map((g) => ({ id: g.id, label: g.label }))).toEqual([
        { id: 'become_pm', label: 'Become a Product Manager' },
        { id: 'transition_pm', label: 'Transition into Product Management' },
        { id: 'grow_career', label: 'Grow in my PM career' },
        { id: 'build_skills', label: 'Build practical PM skills' },
        { id: 'explore_pm', label: 'Explore Product Management' },
      ])
    })

    it('defines the exact 10 Step 3 Interest options supporting multi-select with stable IDs', () => {
      expect(DEFAULT_TOPIC_OPTIONS).toHaveLength(10)
      expect(DEFAULT_TOPIC_OPTIONS.map((t) => ({ id: t.id, label: t.label }))).toEqual([
        { id: 'discovery', label: 'Product Discovery' },
        { id: 'user_research', label: 'User Research' },
        { id: 'strategy', label: 'Product Strategy' },
        { id: 'roadmapping', label: 'Product Roadmapping' },
        { id: 'prioritization', label: 'Prioritization' },
        { id: 'metrics', label: 'Metrics & Analytics' },
        { id: 'prds', label: 'PRDs & Documentation' },
        { id: 'agile', label: 'Agile & Execution' },
        { id: 'stakeholders', label: 'Stakeholder Management' },
        { id: 'launch', label: 'Product Launch' },
      ])
    })

    it('defines the exact 5 Step 3 Learning Preference options with stable IDs', () => {
      expect(DEFAULT_PREFERENCE_OPTIONS).toHaveLength(5)
      expect(DEFAULT_PREFERENCE_OPTIONS.map((p) => ({ id: p.id, label: p.label }))).toEqual([
        { id: 'structured', label: 'Structured learning' },
        { id: 'hands_on', label: 'Hands-on practice' },
        { id: 'case_studies', label: 'Case studies' },
        { id: 'quick_lessons', label: 'Quick lessons' },
        { id: 'mix', label: 'A mix of everything' },
      ])
    })

    it('each goal option has an id, label, description, badge, and recommended module', () => {
      DEFAULT_GOAL_OPTIONS.forEach((opt) => {
        expect(opt.id).toBeTruthy()
        expect(opt.label).toBeTruthy()
        expect(opt.description).toBeTruthy()
        expect(opt.badge).toBeTruthy()
        expect(opt.enabled).toBe(true)
      })
    })

    it('each experience option is well-formed', () => {
      const expIds = DEFAULT_EXPERIENCE_OPTIONS.map((e) => e.id)
      expect(expIds).toContain('beginner')
      expect(expIds).toContain('learning')
      expect(expIds).toContain('working')
      expect(expIds).toContain('experienced')
    })
  })

  describe('Recommendation Engine Logic', () => {
    function computeRecommendation(
      goalId?: string,
      experienceId?: string,
      topics?: string[]
    ) {
      const selectedGoal = DEFAULT_GOAL_OPTIONS.find((g) => g.id === goalId)
      if (selectedGoal?.recommendedModule && CURRICULUM_MODULE_META[selectedGoal.recommendedModule]) {
        if (experienceId === 'beginner' || experienceId === 'learning') {
          return CURRICULUM_MODULE_META.foundations
        }
        return CURRICULUM_MODULE_META[selectedGoal.recommendedModule]
      }

      if (topics && topics.length > 0) {
        if (topics.includes('discovery') || topics.includes('user_research')) {
          return CURRICULUM_MODULE_META.discovery || CURRICULUM_MODULE_META.foundations
        }
        if (topics.includes('strategy') || topics.includes('roadmapping') || topics.includes('prioritization')) {
          return CURRICULUM_MODULE_META.strategy || CURRICULUM_MODULE_META.foundations
        }
        if (topics.includes('prds') || topics.includes('agile')) {
          return CURRICULUM_MODULE_META.execution || CURRICULUM_MODULE_META.foundations
        }
        if (topics.includes('metrics') || topics.includes('launch')) {
          return CURRICULUM_MODULE_META.growth || CURRICULUM_MODULE_META.foundations
        }
        if (topics.includes('stakeholders')) {
          return CURRICULUM_MODULE_META.leadership || CURRICULUM_MODULE_META.foundations
        }
      }

      return CURRICULUM_MODULE_META.foundations
    }

    it('recommends Product Thinking Foundations for beginner learners', () => {
      const rec = computeRecommendation('become_pm', 'beginner', ['discovery'])
      expect(rec.slug).toBe('foundations')
      expect(rec.name).toBe('Product Thinking Foundations')
    })

    it('recommends Product Strategy for experienced PMs focusing on career growth', () => {
      const rec = computeRecommendation('grow_career', 'experienced', ['strategy', 'prioritization'])
      expect(rec.slug).toBe('strategy')
      expect(rec.name).toBe('Product Strategy')
    })

    it('recommends Users & Discovery when working in product with discovery focus', () => {
      const rec = computeRecommendation('build_skills', 'working', ['discovery', 'user_research'])
      expect(rec.slug).toBe('discovery')
      expect(rec.name).toBe('Users, Problems & Discovery')
    })

    it('recommends Execution when user prioritizes PRDs and agile without specific goal match', () => {
      const rec = computeRecommendation(undefined, 'working', ['prds', 'agile'])
      expect(rec.slug).toBe('execution')
      expect(rec.name).toBe('Product Execution')
    })
  })

  describe('Form Validation Rules', () => {
    it('validates username format', () => {
      const isValid = (u: string) => /^[a-z0-9_]{3,24}$/.test(u)
      expect(isValid('alex')).toBe(true)
      expect(isValid('pm_pro_99')).toBe(true)
      expect(isValid('a')).toBe(false) // too short
      expect(isValid('this_is_a_very_long_username_exceeding_limit')).toBe(false) // too long
      expect(isValid('AlexRivera')).toBe(false) // uppercase must be lowercased
      expect(isValid('alex-rivera')).toBe(false) // dashes not allowed
      expect(isValid('alex@pm')).toBe(false) // special chars not allowed
    })
  })
})
