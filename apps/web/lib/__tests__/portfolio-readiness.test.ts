import { describe, it, expect } from 'vitest'
import {
  calculatePortfolioReadiness,
  type PortfolioReadinessInput,
} from '../portfolio-readiness'

describe('Unit 4: Portfolio Completeness & Sharing Readiness Test Suite', () => {
  describe('1. Baseline Readiness & Proof-of-Work Invariant', () => {
    it('returns Ready to Share when essential profile information AND at least 1 public capstone project are provided', () => {
      const shareReadyPortfolio: PortfolioReadinessInput = {
        name: 'Sarah Chen',
        username: 'sarahchen',
        bio: 'Senior Product Manager specializing in AI platform infrastructure and developer productivity.',
        avatarUrl: 'https://images.example.com/avatar.jpg',
        linkedinUrl: 'https://linkedin.com/in/sarahchen',
        githubUrl: 'https://github.com/sarahchen',
        websiteUrl: 'https://sarahchen.io',
        isPortfolioPublic: true,
        publicCapstonesCount: 3,
      }

      const readiness = calculatePortfolioReadiness(shareReadyPortfolio)

      expect(readiness.isReadyToShare).toBe(true)
      expect(readiness.statusLabel).toBe('Ready to Share')
      expect(readiness.missingEssentialCount).toBe(0)
      expect(readiness.missingRecommendedCount).toBe(0)
      expect(readiness.completedCount).toBe(readiness.totalCount)
      expect(readiness.items.every((i) => i.isComplete)).toBe(true)
      expect(readiness.recommendation).toBe(
        'Your portfolio has the essential information and proof of work needed to share publicly.'
      )
    })

    it('returns NOT Ready to Share when user has name + username + visibility + bio + LinkedIn only (0 projects)', () => {
      const linkedInOnlyNoProject: PortfolioReadinessInput = {
        name: 'Jordan Rivera',
        username: 'jrivera',
        bio: 'Product manager focused on mobile growth and B2B SaaS onboarding.',
        avatarUrl: null,
        linkedinUrl: 'https://linkedin.com/in/jrivera',
        githubUrl: null,
        websiteUrl: null,
        isPortfolioPublic: true,
        publicCapstonesCount: 0, // 0 public projects
      }

      const readiness = calculatePortfolioReadiness(linkedInOnlyNoProject)

      expect(readiness.isReadyToShare).toBe(false)
      expect(readiness.statusLabel).toBe('Needs Attention')
      expect(readiness.items.find((i) => i.id === 'project')?.isComplete).toBe(false)
      expect(readiness.items.find((i) => i.id === 'project')?.importance).toBe('essential')
      expect(readiness.recommendation).toBe(
        'Publish at least one public capstone or case study deliverable to provide proof of work before sharing.'
      )
    })

    it('returns NOT Ready to Share when user has name + username + visibility + bio + profile photo only (0 projects)', () => {
      const photoOnlyNoProject: PortfolioReadinessInput = {
        name: 'Elena Rostova',
        username: 'erostova',
        bio: 'Fintech strategy & monetization leader. Product Management Fellow at Prodily.',
        avatarUrl: 'https://images.example.com/elena.jpg',
        linkedinUrl: null,
        githubUrl: null,
        websiteUrl: null,
        isPortfolioPublic: true,
        publicCapstonesCount: 0, // 0 public projects
      }

      const readiness = calculatePortfolioReadiness(photoOnlyNoProject)

      expect(readiness.isReadyToShare).toBe(false)
      expect(readiness.statusLabel).toBe('Needs Attention')
      expect(readiness.items.find((i) => i.id === 'project')?.isComplete).toBe(false)
      expect(readiness.recommendation).toBe(
        'Publish at least one public capstone or case study deliverable to provide proof of work before sharing.'
      )
    })

    it('returns Ready to Share with name + username + visibility + bio + at least one qualifying public project (without photo or socials)', () => {
      const minimalProofOfWorkPortfolio: PortfolioReadinessInput = {
        name: 'Marcus Vance',
        username: 'marcusvance',
        bio: 'Developer tools product manager focused on platform reliability.',
        avatarUrl: null,
        linkedinUrl: null,
        githubUrl: null,
        websiteUrl: null,
        isPortfolioPublic: true,
        publicCapstonesCount: 1, // 1 qualifying public project
      }

      const readiness = calculatePortfolioReadiness(minimalProofOfWorkPortfolio)

      expect(readiness.isReadyToShare).toBe(true)
      expect(readiness.statusLabel).toBe('Ready to Share')
      expect(readiness.missingEssentialCount).toBe(0)
      expect(readiness.items.find((i) => i.id === 'project')?.isComplete).toBe(true)
      expect(readiness.items.find((i) => i.id === 'avatar')?.isComplete).toBe(false)
      expect(readiness.items.find((i) => i.id === 'social')?.isComplete).toBe(false)
    })

    it('flags private visibility as essential blocker for sharing readiness', () => {
      const privatePortfolioWithProject: PortfolioReadinessInput = {
        name: 'Elena Rostova',
        username: 'erostova',
        bio: 'Product leader focused on fintech monetization and B2B expansion.',
        avatarUrl: 'https://images.example.com/elena.jpg',
        linkedinUrl: 'https://linkedin.com/in/erostova',
        isPortfolioPublic: false,
        publicCapstonesCount: 2,
      }

      const readiness = calculatePortfolioReadiness(privatePortfolioWithProject)

      expect(readiness.isReadyToShare).toBe(false)
      expect(readiness.statusLabel).toBe('Incomplete')
      expect(readiness.items.find((i) => i.id === 'visibility')?.isComplete).toBe(false)
      expect(readiness.recommendation).toContain('currently private')
    })
  })

  describe('2. Early-Career Fairness & Non-Employment Standards', () => {
    it('grants Ready to Share status to early-career candidates with 1 capstone project without requiring employment history or corporate references', () => {
      const earlyCareerFellow: PortfolioReadinessInput = {
        name: 'Alex Rivera',
        username: 'arivera',
        bio: 'Aspiring Product Manager transitioning into SaaS. Product Management Fellow at Prodily.',
        avatarUrl: 'https://images.example.com/alex.jpg',
        linkedinUrl: 'https://linkedin.com/in/alexrivera',
        githubUrl: null,
        websiteUrl: null,
        isPortfolioPublic: true,
        publicCapstonesCount: 1, // 1 applied module project
      }

      const readiness = calculatePortfolioReadiness(earlyCareerFellow)

      expect(readiness.isReadyToShare).toBe(true)
      expect(readiness.statusLabel).toBe('Ready to Share')
      expect(readiness.missingEssentialCount).toBe(0)
      expect(readiness.items.find((i) => i.id === 'project')?.isComplete).toBe(true)
    })

    it('treats LinkedIn, GitHub, personal website, and profile photo as optional supporting signals', () => {
      const noSocialsOrPhoto: PortfolioReadinessInput = {
        name: 'Taylor Reed',
        username: 'treed',
        bio: 'Product strategist passionate about customer discovery and market research.',
        avatarUrl: null,
        linkedinUrl: null,
        githubUrl: null,
        websiteUrl: null,
        isPortfolioPublic: true,
        publicCapstonesCount: 1,
      }

      const readiness = calculatePortfolioReadiness(noSocialsOrPhoto)

      expect(readiness.isReadyToShare).toBe(true)
      expect(readiness.items.find((i) => i.id === 'avatar')?.importance).toBe('recommended')
      expect(readiness.items.find((i) => i.id === 'social')?.importance).toBe('recommended')
    })
  })

  describe('3. Decoupling from Gamification Invariant', () => {
    it('evaluates readiness identically regardless of XP, streak, or gamification level', () => {
      const candidateData: PortfolioReadinessInput = {
        name: 'Marcus Vance',
        username: 'marcusvance',
        bio: 'Product manager focused on platform growth and marketplace liquidity.',
        avatarUrl: 'https://images.example.com/marcus.jpg',
        linkedinUrl: 'https://linkedin.com/in/marcusvance',
        isPortfolioPublic: true,
        publicCapstonesCount: 2,
      }

      // calculatePortfolioReadiness does not accept or depend on XP, level, or badges
      const readiness = calculatePortfolioReadiness(candidateData)

      expect(readiness.isReadyToShare).toBe(true)
      expect(readiness.items.every((i) => !('xp' in i))).toBe(true)
      expect(readiness.items.every((i) => !('level' in i))).toBe(true)
      expect(readiness.items.every((i) => !('badge' in i))).toBe(true)
    })
  })

  describe('4. Action Anchors and Checklist Mapping', () => {
    it('provides actionAnchor mapping for incomplete items to assist owner in settings UI', () => {
      const partiallyComplete: PortfolioReadinessInput = {
        name: 'Taylor Swift',
        username: 'tswift',
        bio: '', // Missing
        avatarUrl: null, // Missing
        linkedinUrl: null, // Missing
        isPortfolioPublic: true,
        publicCapstonesCount: 0, // Missing
      }

      const readiness = calculatePortfolioReadiness(partiallyComplete)

      const bioItem = readiness.items.find((i) => i.id === 'bio')
      expect(bioItem?.isComplete).toBe(false)
      expect(bioItem?.actionAnchor).toBe('setting-bio')

      const projectItem = readiness.items.find((i) => i.id === 'project')
      expect(projectItem?.isComplete).toBe(false)
      expect(projectItem?.actionAnchor).toBe('setting-featured-capstone')

      const socialItem = readiness.items.find((i) => i.id === 'social')
      expect(socialItem?.isComplete).toBe(false)
      expect(socialItem?.actionAnchor).toBe('setting-linkedin')
    })
  })
})
