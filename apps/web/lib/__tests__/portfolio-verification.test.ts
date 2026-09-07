import { describe, it, expect } from 'vitest'
import { calculatePortfolioReadiness } from '../portfolio-readiness'
import { calculatePortfolioVerification } from '../portfolio-readiness'

const fullProfile = {
  name: 'Jordan PM',
  username: 'jordanpm',
  bio: 'Product manager focused on developer tools.',
  avatarUrl: 'https://cdn.example.com/avatar.png',
  linkedinUrl: 'https://linkedin.com/in/jordanpm',
  githubUrl: 'https://github.com/jordanpm',
  websiteUrl: null,
  isPortfolioPublic: true,
  publicCapstonesCount: 1,
}

describe('Automatic Portfolio Verification', () => {
  it('is eligible with avatar + bio + exactly 2 of 3 links', () => {
    const readiness = calculatePortfolioReadiness(fullProfile)
    const verification = calculatePortfolioVerification(
      readiness,
      { linkedinUrl: fullProfile.linkedinUrl, githubUrl: fullProfile.githubUrl, websiteUrl: fullProfile.websiteUrl },
      null
    )
    expect(verification.linkCount).toBe(2)
    expect(verification.isAutoEligible).toBe(true)
    expect(verification.isVerified).toBe(true)
    expect(verification.source).toBe('auto')
  })

  it('is NOT eligible with only 1 of 3 links, even with avatar + bio', () => {
    const profile = { ...fullProfile, githubUrl: null }
    const readiness = calculatePortfolioReadiness(profile)
    const verification = calculatePortfolioVerification(
      readiness,
      { linkedinUrl: profile.linkedinUrl, githubUrl: profile.githubUrl, websiteUrl: profile.websiteUrl },
      null
    )
    expect(verification.linkCount).toBe(1)
    expect(verification.isAutoEligible).toBe(false)
    expect(verification.isVerified).toBe(false)
  })

  it('is NOT eligible without an avatar, even with 2+ links and a bio', () => {
    const profile = { ...fullProfile, avatarUrl: null }
    const readiness = calculatePortfolioReadiness(profile)
    const verification = calculatePortfolioVerification(
      readiness,
      { linkedinUrl: profile.linkedinUrl, githubUrl: profile.githubUrl, websiteUrl: profile.websiteUrl },
      null
    )
    expect(verification.isAutoEligible).toBe(false)
  })

  it('is NOT eligible without a bio, even with an avatar and 2+ links', () => {
    const profile = { ...fullProfile, bio: null }
    const readiness = calculatePortfolioReadiness(profile)
    const verification = calculatePortfolioVerification(
      readiness,
      { linkedinUrl: profile.linkedinUrl, githubUrl: profile.githubUrl, websiteUrl: profile.websiteUrl },
      null
    )
    expect(verification.isAutoEligible).toBe(false)
  })

  it('this bar is genuinely stricter than "ready to share" (which only needs 1 link, no avatar)', () => {
    const minimalReadyToShare = {
      ...fullProfile,
      avatarUrl: null,
      linkedinUrl: 'https://linkedin.com/in/jordanpm',
      githubUrl: null,
      websiteUrl: null,
    }
    const readiness = calculatePortfolioReadiness(minimalReadyToShare)
    expect(readiness.isReadyToShare).toBe(true) // essential-only bar is met

    const verification = calculatePortfolioVerification(
      readiness,
      { linkedinUrl: minimalReadyToShare.linkedinUrl, githubUrl: null, websiteUrl: null },
      null
    )
    expect(verification.isAutoEligible).toBe(false) // verification's stricter bar is NOT met
  })

  it('admin override "verified" forces verified status even when not auto-eligible', () => {
    const profile = { ...fullProfile, avatarUrl: null } // not auto-eligible
    const readiness = calculatePortfolioReadiness(profile)
    const verification = calculatePortfolioVerification(
      readiness,
      { linkedinUrl: profile.linkedinUrl, githubUrl: profile.githubUrl, websiteUrl: profile.websiteUrl },
      'verified'
    )
    expect(verification.isAutoEligible).toBe(false)
    expect(verification.isVerified).toBe(true)
    expect(verification.source).toBe('admin_verified')
  })

  it('admin override "rejected" forces not-verified even when auto-eligible', () => {
    const readiness = calculatePortfolioReadiness(fullProfile)
    const verification = calculatePortfolioVerification(
      readiness,
      { linkedinUrl: fullProfile.linkedinUrl, githubUrl: fullProfile.githubUrl, websiteUrl: fullProfile.websiteUrl },
      'rejected'
    )
    expect(verification.isAutoEligible).toBe(true)
    expect(verification.isVerified).toBe(false)
    expect(verification.source).toBe('admin_rejected')
  })

  it('reuses the SAME hasAvatar/hasBio signals as calculatePortfolioReadiness (no duplicate logic)', () => {
    // A bio of exactly 9 chars fails readiness's hasBio threshold (>= 10) — verification
    // must agree, since it reads the readiness.items result rather than re-deriving it.
    const profile = { ...fullProfile, bio: '123456789' }
    const readiness = calculatePortfolioReadiness(profile)
    const bioItem = readiness.items.find((i) => i.id === 'bio')
    expect(bioItem?.isComplete).toBe(false)

    const verification = calculatePortfolioVerification(
      readiness,
      { linkedinUrl: profile.linkedinUrl, githubUrl: profile.githubUrl, websiteUrl: profile.websiteUrl },
      null
    )
    expect(verification.isAutoEligible).toBe(false)
  })
})
