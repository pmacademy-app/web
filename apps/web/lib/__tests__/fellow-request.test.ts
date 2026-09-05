/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi } from 'vitest'
import { isFellowEligible, deriveFellowRequestState } from '../fellow'
import { calculatePortfolioReadiness } from '../portfolio-readiness'
import { getUserFellowState, submitFellowRequest } from '../fellow-requests-db'

const fullyCompleteInput = {
  name: 'Jordan PM',
  username: 'jordanpm',
  bio: 'Product manager focused on developer tools.',
  avatarUrl: 'https://cdn.example.com/avatar.png',
  linkedinUrl: 'https://linkedin.com/in/jordanpm',
  githubUrl: null,
  websiteUrl: null,
  isPortfolioPublic: true,
  publicCapstonesCount: 2,
}

describe('PM Fellow — pure eligibility logic', () => {
  it('is eligible only when 100% of readiness items are complete (essential + recommended)', () => {
    const full = calculatePortfolioReadiness(fullyCompleteInput)
    expect(full.completedCount).toBe(full.totalCount)
    expect(isFellowEligible(full)).toBe(true)

    // "Ready to share" (essential-only) but missing recommended items (avatar/social) — NOT Fellow-eligible.
    const essentialOnly = calculatePortfolioReadiness({
      ...fullyCompleteInput,
      avatarUrl: null,
      linkedinUrl: null,
    })
    expect(essentialOnly.isReadyToShare).toBe(true)
    expect(isFellowEligible(essentialOnly)).toBe(false)
  })

  it('derives "not_eligible" when incomplete and no prior request', () => {
    const readiness = calculatePortfolioReadiness({ ...fullyCompleteInput, avatarUrl: null })
    const state = deriveFellowRequestState({ isFellow: false, readiness, latestRequestStatus: null })
    expect(state.state).toBe('not_eligible')
    expect(state.canSubmit).toBe(false)
  })

  it('derives "eligible" and allows submission when 100% complete with no prior request', () => {
    const readiness = calculatePortfolioReadiness(fullyCompleteInput)
    const state = deriveFellowRequestState({ isFellow: false, readiness, latestRequestStatus: null })
    expect(state.state).toBe('eligible')
    expect(state.canSubmit).toBe(true)
  })

  it('derives "pending" and blocks re-submission while a request is outstanding', () => {
    const readiness = calculatePortfolioReadiness(fullyCompleteInput)
    const state = deriveFellowRequestState({ isFellow: false, readiness, latestRequestStatus: 'pending' })
    expect(state.state).toBe('pending')
    expect(state.canSubmit).toBe(false)
  })

  it('always shows "approved" once is_fellow is true, regardless of readiness regression', () => {
    const readiness = calculatePortfolioReadiness({ ...fullyCompleteInput, avatarUrl: null }) // regressed
    const state = deriveFellowRequestState({ isFellow: true, readiness, latestRequestStatus: 'approved' })
    expect(state.state).toBe('approved')
    expect(state.canSubmit).toBe(false)
  })

  it('allows re-request after rejection once eligibility is (re)met, but stays "rejected" otherwise', () => {
    const eligible = calculatePortfolioReadiness(fullyCompleteInput)
    const stillIneligible = calculatePortfolioReadiness({ ...fullyCompleteInput, avatarUrl: null })

    const canReapply = deriveFellowRequestState({ isFellow: false, readiness: eligible, latestRequestStatus: 'rejected' })
    expect(canReapply.state).toBe('eligible')
    expect(canReapply.canSubmit).toBe(true)

    const stillRejected = deriveFellowRequestState({ isFellow: false, readiness: stillIneligible, latestRequestStatus: 'rejected' })
    expect(stillRejected.state).toBe('rejected')
    expect(stillRejected.canSubmit).toBe(false)
  })
})

describe('PM Fellow — request submission (DB layer, mocked Supabase)', () => {
  function chainable(result: { data: unknown; error?: unknown }, singleResult: { data: unknown; error?: unknown }) {
    const obj: any = new Proxy(
      {},
      {
        get(_target, prop) {
          if (prop === 'then') return (resolve: (v: unknown) => void) => resolve(result)
          if (prop === 'maybeSingle' || prop === 'single') return () => chainable(singleResult, singleResult)
          return () => obj
        },
      }
    )
    return obj
  }

  it('rejects submission server-side when the user is not actually eligible (defense in depth)', async () => {
    const supabase = {
      from: vi.fn((table: string) => {
      if (table === 'users') {
        return chainable(
          { data: null },
          {
            data: {
              username: 'incomplete',
              name: 'Incomplete User',
              bio: '',
              avatar_url: null,
              linkedin_url: null,
              github_url: null,
              website_url: null,
              is_portfolio_public: true,
              is_fellow: false,
            },
          }
        )
      }
      if (table === 'capstone_submissions') return chainable({ data: [] }, { data: [] })
      if (table === 'fellow_requests') return chainable({ data: null }, { data: null })
      return chainable({ data: null }, { data: null })
      }),
    } as any

    await expect(submitFellowRequest(supabase, 'user-incomplete')).rejects.toThrow(
      /does not yet meet all Fellow eligibility requirements/
    )
  })

  it('blocks a second submission while one is already pending', async () => {
    const supabase = {
      from: vi.fn((table: string) => {
        if (table === 'users') {
          return chainable(
            { data: null },
            {
              data: {
                username: 'jordanpm',
                name: 'Jordan PM',
                bio: fullyCompleteInput.bio,
                avatar_url: fullyCompleteInput.avatarUrl,
                linkedin_url: fullyCompleteInput.linkedinUrl,
                github_url: null,
                website_url: null,
                is_portfolio_public: true,
                is_fellow: false,
              },
            }
          )
        }
        if (table === 'capstone_submissions') return chainable({ data: [{ is_public: true }, { is_public: true }] }, { data: null })
        if (table === 'fellow_requests') {
          return chainable(
            { data: null },
            { data: { id: 'req-1', user_id: 'user-1', status: 'pending', requested_at: new Date().toISOString(), reviewed_by: null, reviewed_at: null, rejection_reason: null } }
          )
        }
        return chainable({ data: null }, { data: null })
      }),
    } as any

    await expect(submitFellowRequest(supabase, 'user-1')).rejects.toThrow(/already have a pending Fellow request/)
  })

  it('getUserFellowState composes readiness + fellow flag + latest request into one payload', async () => {
    const supabase = {
      from: vi.fn((table: string) => {
        if (table === 'users') {
          return chainable(
            { data: null },
            {
              data: {
                username: 'jordanpm',
                name: 'Jordan PM',
                bio: fullyCompleteInput.bio,
                avatar_url: fullyCompleteInput.avatarUrl,
                linkedin_url: fullyCompleteInput.linkedinUrl,
                github_url: null,
                website_url: null,
                is_portfolio_public: true,
                is_fellow: false,
              },
            }
          )
        }
        if (table === 'capstone_submissions') return chainable({ data: [{ is_public: true }] }, { data: null })
        if (table === 'fellow_requests') return chainable({ data: null }, { data: null })
        return chainable({ data: null }, { data: null })
      }),
    } as any

    const state = await getUserFellowState(supabase, 'user-1')
    expect(state.latestRequest).toBeNull()
    expect(state.readiness.completedCount).toBe(state.readiness.totalCount)
    expect(state.state).toBe('eligible')
    expect(state.canSubmit).toBe(true)
  })
})
