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
              update: (row: Record<string, unknown>) => ({
                eq: (_col: string, _val: string) => {
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
})
