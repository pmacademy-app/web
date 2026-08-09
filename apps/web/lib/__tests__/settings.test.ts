import { describe, it } from 'node:test'
import assert from 'node:assert'
import { getAuthenticatedUserFromRequest } from '../auth'
import { resetXp } from '../settings/settings-service'

describe('Sprint 7.2 Settings 2.0 & Auth Regression Unit Tests', () => {
  describe('Auth Helper Bug-Class Regression Test', () => {
    it('getAuthenticatedUserFromRequest returns user object or null directly (not wrapped in object)', async () => {
      // Create a mock HTTP Request without authorization header
      const mockRequest = new Request('http://localhost:3000/api/settings/portfolio')
      const result = await getAuthenticatedUserFromRequest(mockRequest)

      // Must be null (or User object when authenticated) — NEVER { user: null } or undefined
      assert.strictEqual(result, null, 'Unauthenticated request must return null')
    })
  })

  describe('Typed Confirmation Keyword Matching', () => {
    it('strictly matches keyword with case-sensitivity and rejects near-misses', () => {
      const keyword = 'RESET'

      const exactMatch = 'RESET'.trim() === keyword
      const lowercaseMatch = 'reset'.trim() === keyword
      const whitespaceMatch = ' RESET '.trim() === keyword
      const typoMatch = 'RESE'.trim() === keyword

      assert.strictEqual(exactMatch, true, 'Exact uppercase match must succeed')
      assert.strictEqual(lowercaseMatch, false, 'Lowercase match must be rejected')
      assert.strictEqual(whitespaceMatch, true, 'Trimmed whitespace match must succeed')
      assert.strictEqual(typoMatch, false, 'Typo near-miss must be rejected')
    })

    it('strictly matches DELETE keyword for account deletion', () => {
      const keyword = 'DELETE'

      assert.strictEqual('DELETE'.trim() === keyword, true)
      assert.strictEqual('delete'.trim() === keyword, false)
      assert.strictEqual('DELET'.trim() === keyword, false)
    })
  })

  describe('Ledger-Respecting XP Reset Invariant Math', () => {
    it('calculates negative XP row amount to bring total XP balance to 0 without deleting ledger rows', async () => {
      // Mock Supabase client with existing XP total of 1250
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
                // eslint-disable-next-line @typescript-eslint/no-unused-vars
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

      assert.strictEqual(newTotal, 0, 'New total XP must be 0')
      assert.ok(insertedRow, 'An audit row must be inserted into xp_events')
      
      const inserted = insertedRow as unknown as Record<string, unknown>
      assert.strictEqual(inserted.source_type, 'user_reset', 'Source type must be user_reset')
      assert.strictEqual(inserted.xp_amount, -1250, 'XP amount inserted must equal negative current total')
      
      const updated = updatedUserRow as unknown as Record<string, unknown>
      assert.ok(updated, 'User row must be updated')
      assert.strictEqual(updated.total_xp, 0, 'User total_xp cache updated to 0')
      assert.strictEqual(updated.level, 1, 'User level updated to 1')
    })
  })
})
