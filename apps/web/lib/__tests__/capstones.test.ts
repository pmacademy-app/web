import { describe, it, expect } from 'vitest'
import {
  getAllCapstoneDefinitions,
  getCapstoneDefinition,
} from '../../config/capstones'
import {
  calculateCapstoneWordCount,
  validateCapstoneSubmission,
  deriveCapstoneStatus,
} from '../capstones'
import { XP_VALUES } from '../xp'

describe('Capstones Unit Test Suite', () => {
  describe('Capstone Definitions', () => {
    it('All 9 module capstone definitions exist and are ordered', () => {
      const definitions = getAllCapstoneDefinitions()
      expect(definitions.length).toBe(9)
      expect(definitions[0].moduleSlug).toBe('foundations')
      expect(definitions[8].moduleSlug).toBe('capstone')

      for (let i = 0; i < definitions.length; i++) {
        expect(definitions[i].moduleNumber).toBe(i + 1)
        expect(definitions[i].minWordCount).toBeGreaterThanOrEqual(250)
      }
    })

    it('getCapstoneDefinition retrieves correct definition by slug', () => {
      const foundations = getCapstoneDefinition('foundations')
      expect(foundations).not.toBeNull()
      expect(foundations?.title).toBe('Product Opportunity Brief & Problem Definition')

      const invalid = getCapstoneDefinition('invalid-module-slug')
      expect(invalid).toBeNull()
    })
  })

  describe('Word Count Utility', () => {
    it('calculateCapstoneWordCount calculates words and strips markdown formatting', () => {
      const markdownText = `# Header Title\n\nThis is a **bold** paragraph with *italic* text and a [link](https://example.com).\n\n> Blockquote here.`
      const { wordCount, characterCount } = calculateCapstoneWordCount(markdownText)

      expect(wordCount).toBeGreaterThan(10)
      expect(characterCount).toBe(markdownText.length)

      const emptyResult = calculateCapstoneWordCount('')
      expect(emptyResult.wordCount).toBe(0)
      expect(emptyResult.characterCount).toBe(0)
    })
  })

  describe('Submission Validation', () => {
    it('validateCapstoneSubmission flags submissions below minimum word count', () => {
      const shortText = 'Short submission text with only a few words.'
      const validation = validateCapstoneSubmission('foundations', shortText)

      expect(validation.isValid).toBe(false)
      expect(validation.missingRequirements.length).toBeGreaterThan(0)
      expect(validation.reason).toContain('Minimum 250 words required')
    })

    it('validateCapstoneSubmission passes valid submission meeting word count and sections', () => {
      const validText = `
# Product Opportunity Brief: Customer Onboarding Improvement

## 1. Problem Statement
The user onboarding dropoff rate is currently 42% within the first 14 days. Customers report feeling overwhelmed by excessive initial configuration steps and unclear value propositions.

## 2. Target Persona & User Segment
Our primary target user persona is the Early Career Product Manager trying to quickly set up their workspace. Their main constraint is limited time during work hours.

## 3. Jobs-To-Be-Done (JTBD)
- **Core Job:** When I first sign up for the platform, I want a guided setup wizard so that I can reach my first value milestone in under 5 minutes.
- **Emotional Job:** Feel confident and competent using the tool.

## 4. Business Impact & Success Metrics
- **Primary Metric:** 14-day onboarding activation rate increase from 58% to 75%.
- **Secondary Metrics:** Time to first active project creation reduced from 20 minutes to 5 minutes.
- **Guardrail Metric:** User support ticket volume should not increase by more than 5%.

## 5. Key Risks & Hypotheses
We hypothesize that replacing raw forms with an interactive step-by-step checklist will increase activation by reducing cognitive overload.
`.repeat(2)

      const validation = validateCapstoneSubmission('foundations', validText)

      expect(validation.isValid).toBe(true)
      expect(validation.missingRequirements.length).toBe(0)
      expect(validation.wordCount).toBeGreaterThanOrEqual(250)
    })
  })

  describe('Status Derivation Logic', () => {
    it('deriveCapstoneStatus returns appropriate status based on submission and progress', () => {
      expect(deriveCapstoneStatus('submitted')).toBe('submitted')
      expect(deriveCapstoneStatus('reviewed')).toBe('reviewed')
      expect(deriveCapstoneStatus('draft')).toBe('draft')
      expect(deriveCapstoneStatus(null, 8)).toBe('unlocked')
      expect(deriveCapstoneStatus(null, 2)).toBe('locked')
    })
  })

  describe('XP Constant Verification', () => {
    it('Capstone XP constant is set to 150', () => {
      expect(XP_VALUES.CAPSTONE_SUBMITTED).toBe(150)
    })
  })
})
