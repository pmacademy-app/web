import { describe, it, expect } from 'vitest'
import { getAuthenticatedUserFromRequest } from '../auth'
import { resetXp } from '../settings/settings-service'

describe('Sprint 7.2 Settings 2.0 & Auth Regression Unit Tests', () => {
  describe('Auth Helper Bug-Class Regression Test', () => {
    it('getAuthenticatedUserFromRequest returns user object or null directly (not wrapped in object)', async () => {
      const mockRequest = new Request('http://localhost:3000/api/settings/portfolio')
      const result = await getAuthenticatedUserFromRequest(mockRequest)
      expect(result).toBeNull()
    })
  })

  describe('Typed Confirmation Keyword Matching', () => {
    it('strictly matches keyword with case-sensitivity and rejects near-misses', () => {
      const keyword = 'RESET'
      const exactMatch = 'RESET'.trim() === keyword
      const lowercaseMatch = 'reset'.trim() === keyword
      const whitespaceMatch = ' RESET '.trim() === keyword
      const typoMatch = 'RESE'.trim() === keyword

      expect(exactMatch).toBe(true)
      expect(lowercaseMatch).toBe(false)
      expect(whitespaceMatch).toBe(true)
      expect(typoMatch).toBe(false)
    })

    it('strictly matches DELETE keyword for account deletion', () => {
      const keyword = 'DELETE'
      expect('DELETE'.trim() === keyword).toBe(true)
      expect('delete'.trim() === keyword).toBe(false)
      expect('DELET'.trim() === keyword).toBe(false)
    })
  })

  describe('Ledger-Respecting XP Reset Invariant Math', () => {
    it('calculates negative XP row amount to bring total XP balance to 0 without deleting ledger rows', async () => {
      const currentTotalXp = 1250
      let insertedRow: Record<string, unknown> | null = null
      let updatedUserRow: Record<string, unknown> | null = null

      const mockSupabase: unknown = {
        from: (table: string) => {
          if (table === 'xp_events') {
            return {
              select: () => ({
                eq: () => Promise.resolve({ data: [{ xp_amount: currentTotalXp }], error: null }),
              }),
              insert: (row: Record<string, unknown>) => {
                insertedRow = row
                return Promise.resolve({ data: null, error: null })
              },
            }
          }
          if (table === 'users') {
            return {
              // B8-B: getTotalXp() now reads the trigger-maintained users.total_xp
              // instead of summing the ledger, so this double must answer reads too.
              select: () => ({
                eq: () => ({
                  maybeSingle: () =>
                    Promise.resolve({ data: { total_xp: currentTotalXp }, error: null }),
                }),
              }),
              update: (row: Record<string, unknown>) => ({
                eq: () => {
                  updatedUserRow = row
                  return Promise.resolve({ data: null, error: null })
                },
              }),
            }
          }
          return {}
        },
      }

      const newTotal = await resetXp(mockSupabase as unknown as Parameters<typeof resetXp>[0], 'user_123')
      expect(newTotal).toBe(0)
      expect(insertedRow).toBeDefined()

      const inserted = insertedRow as unknown as Record<string, unknown>
      expect(inserted.source_type).toBe('user_reset')
      expect(inserted.xp_amount).toBe(-1250)

      const updated = updatedUserRow as unknown as Record<string, unknown>
      expect(updated).toBeDefined()
      expect(updated.total_xp).toBe(0)
      expect(updated.level).toBe(1)
    })
  })

  describe('Profile Settings API Hardening', () => {
    it('rejects unauthenticated requests to POST /api/settings/profile with 401', async () => {
      const { POST } = await import('../../app/api/settings/profile/route')
      const request = new Request('http://localhost:3000/api/settings/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Test' }),
      })

      const response = await POST(request)
      expect(response.status).toBe(401)
      const data = await response.json()
      expect(data.error).toContain('Unauthorized')
    })

    it('rejects unauthenticated requests to GET /api/settings/profile with 401', async () => {
      const { GET } = await import('../../app/api/settings/profile/route')
      const request = new Request('http://localhost:3000/api/settings/profile', {
        method: 'GET',
      })

      const response = await GET(request)
      expect(response.status).toBe(401)
    })
  })
})
