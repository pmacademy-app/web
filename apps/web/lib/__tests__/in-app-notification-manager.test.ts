/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  InAppManagerService,
  mapPriorityLevelToNumber,
  mapNumberToPriorityLevel,
} from '../admin/in-app-manager-service'
import { buildInAppContentFromEvent } from '../notifications/in-app/service'

const mockDb: {
  broadcasts: any[]
  inAppNotifications: any[]
  cohortMembers: any[]
  users: any[]
} = {
  broadcasts: [],
  inAppNotifications: [],
  cohortMembers: [],
  users: [],
}

vi.mock('@/lib/supabase', () => {
  return {
    createServiceRoleClient: () => ({
      from: (table: string) => {
        if (table === 'in_app_broadcasts') {
          return {
            select: () => ({
              order: () => ({
                range: (from: number, to: number) => {
                  const items = mockDb.broadcasts.slice(from, to + 1)
                  return Promise.resolve({
                    data: items,
                    count: mockDb.broadcasts.length,
                    error: null,
                  })
                },
                lte: () => ({
                  order: () => ({
                    limit: () => {
                      const matched = mockDb.broadcasts.filter(
                        (b) => b.status === 'scheduled' && new Date(b.scheduled_at).getTime() <= Date.now()
                      )
                      return Promise.resolve({ data: matched, error: null })
                    },
                  }),
                }),
              }),
              eq: (col: string, val: any) => ({
                maybeSingle: () => {
                  const found = mockDb.broadcasts.find((b) => b[col] === val)
                  return Promise.resolve({ data: found || null, error: null })
                },
                lte: () => ({
                  order: () => ({
                    limit: () => {
                      const matched = mockDb.broadcasts.filter(
                        (b) => b[col] === val && new Date(b.scheduled_at).getTime() <= Date.now()
                      )
                      return Promise.resolve({ data: matched, error: null })
                    },
                  }),
                }),
              }),
            }),
            insert: (row: any) => {
              const inserted = { id: row.id || `bcast-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, ...row }
              mockDb.broadcasts.push(inserted)
              return {
                select: () => ({
                  single: () => Promise.resolve({ data: inserted, error: null }),
                }),
              }
            },
            update: (patch: any) => ({
              eq: (col: string, val: any) => {
                const index = mockDb.broadcasts.findIndex((b) => b[col] === val)
                if (index !== -1) {
                  mockDb.broadcasts[index] = { ...mockDb.broadcasts[index], ...patch }
                }
                const updated = mockDb.broadcasts[index]
                return {
                  select: () => ({
                    single: () => Promise.resolve({ data: updated || null, error: null }),
                  }),
                  error: null,
                }
              },
            }),
            delete: () => ({
              eq: (col: string, val: any) => {
                mockDb.broadcasts = mockDb.broadcasts.filter((b) => b[col] !== val)
                return Promise.resolve({ error: null })
              },
            }),
          }
        }

        if (table === 'in_app_notifications') {
          return {
            select: () => {
              return {
                eq: (col: string, val: any) => {
                  let filtered = mockDb.inAppNotifications.filter((n) => n[col] === val)
                  return {
                    eq: (col2: string, val2: any) => {
                      filtered = filtered.filter((n) => n[col2] === val2)
                      return {
                        maybeSingle: () => Promise.resolve({ data: filtered[0] || null, error: null }),
                      }
                    },
                    maybeSingle: () => Promise.resolve({ data: filtered[0] || null, error: null }),
                  }
                },
                like: (col: string, pattern: string) => {
                  const prefix = pattern.replace('%', '')
                  let filtered = mockDb.inAppNotifications.filter((n) => (n[col] || '').startsWith(prefix))
                  return {
                    eq: (col2: string, val2: any) => {
                      filtered = filtered.filter((n) => n[col2] === val2)
                      return Promise.resolve({ data: filtered, count: filtered.length, error: null })
                    },
                  }
                },
              }
            },
            insert: (row: any) => {
              const inserted = { id: row.id || `notif-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, ...row }
              mockDb.inAppNotifications.push(inserted)
              return {
                select: () => ({
                  single: () => Promise.resolve({ data: inserted, error: null }),
                }),
              }
            },
          }
        }

        if (table === 'cohort_members') {
          return {
            select: () => ({
              eq: (col: string, val: any) => {
                const members = mockDb.cohortMembers.filter((m) => m[col] === val)
                return Promise.resolve({ data: members, error: null })
              },
            }),
          }
        }

        if (table === 'users') {
          return {
            select: () => ({
              eq: (col: string, val: any) => ({
                maybeSingle: () => {
                  const u = mockDb.users.find((user) => user[col] === val)
                  return Promise.resolve({ data: u || null, error: null })
                },
              }),
            }),
          }
        }

        return {
          select: () => ({
            eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }),
          }),
        }
      },
    }),
  }
})

vi.mock('../admin/user-filter-query', () => {
  return {
    queryUserIds: vi.fn().mockImplementation((filters: any) => {
      let matching = [...mockDb.users]
      if (filters?.verificationStatus === 'verified') {
        matching = matching.filter((u) => u.is_verified)
      }
      return Promise.resolve({
        userIds: matching.map((u) => u.id),
        total: matching.length,
      })
    }),
    countMatchingUsers: vi.fn().mockImplementation((filters: any) => {
      let matching = [...mockDb.users]
      if (filters?.verificationStatus === 'verified') {
        matching = matching.filter((u) => u.is_verified)
      }
      return Promise.resolve(matching.length)
    }),
    sampleMatchingUsers: vi.fn().mockImplementation((filters: any, limit: number) => {
      let matching = [...mockDb.users]
      if (filters?.verificationStatus === 'verified') {
        matching = matching.filter((u) => u.is_verified)
      }
      return Promise.resolve(matching.slice(0, limit))
    }),
  }
})

describe('Phase 2 — In-App Notification Manager & Operations', () => {
  beforeEach(() => {
    mockDb.broadcasts = []
    mockDb.inAppNotifications = []
    mockDb.cohortMembers = []
    mockDb.users = [
      { id: 'usr-1', email: 'alice@example.com', name: 'Alice', is_verified: true },
      { id: 'usr-2', email: 'bob@example.com', name: 'Bob', is_verified: true },
      { id: 'usr-3', email: 'charlie@example.com', name: 'Charlie', is_verified: false },
    ]
  })

  describe('Priority Mapping', () => {
    it('correctly maps priority levels to numbers and back', () => {
      expect(mapPriorityLevelToNumber('urgent')).toBe(1)
      expect(mapPriorityLevelToNumber('high')).toBe(2)
      expect(mapPriorityLevelToNumber('medium')).toBe(5)
      expect(mapPriorityLevelToNumber('low')).toBe(8)

      expect(mapNumberToPriorityLevel(1)).toBe('urgent')
      expect(mapNumberToPriorityLevel(2)).toBe('high')
      expect(mapNumberToPriorityLevel(5)).toBe('medium')
      expect(mapNumberToPriorityLevel(8)).toBe('low')
    })
  })

  describe('Creation & Drafting', () => {
    it('creates a draft in-app notification campaign with all metadata', async () => {
      const item = await InAppManagerService.createBroadcast({
        title: 'New Product Analytics Module Available',
        body: 'Dive into Amplitude, Mixpanel, and behavioral cohort analysis.',
        category: 'learning',
        priority: 'high',
        actionUrl: '/academy/analytics-module',
        audience: 'all',
      })

      expect(item.id).toBeDefined()
      expect(item.title).toBe('New Product Analytics Module Available')
      expect(item.status).toBe('draft')
      expect(item.priority).toBe('high')
      expect(item.priorityNumber).toBe(2)
      expect(item.actionUrl).toBe('/academy/analytics-module')
      expect(item.totalDelivered).toBe(0)
    })

    it('creates a scheduled in-app notification when scheduledAt is provided', async () => {
      const futureDate = new Date(Date.now() + 86400000).toISOString()
      const item = await InAppManagerService.createBroadcast({
        title: 'Weekly Community Office Hours',
        body: 'Join the live PM coaching call tomorrow at 10 AM.',
        category: 'announcement',
        priority: 'medium',
        scheduledAt: futureDate,
      })

      expect(item.status).toBe('scheduled')
      expect(item.scheduledAt).toBe(futureDate)
    })
  })

  describe('Audience Targeting & Resolution', () => {
    it('resolves individual user target', async () => {
      const broadcast: any = {
        id: 'b-indiv',
        audience: 'individual',
        targetUserId: 'usr-1',
      }
      const recipients = await InAppManagerService.resolveRecipients(broadcast)
      expect(recipients).toEqual(['usr-1'])
    })

    it('resolves cohort members target', async () => {
      mockDb.cohortMembers.push({ cohort_id: 'cohort-101', user_id: 'usr-1' })
      mockDb.cohortMembers.push({ cohort_id: 'cohort-101', user_id: 'usr-2' })

      const broadcast: any = {
        id: 'b-cohort',
        audience: 'cohort',
        targetCohortId: 'cohort-101',
      }
      const recipients = await InAppManagerService.resolveRecipients(broadcast)
      expect(recipients).toEqual(['usr-1', 'usr-2'])
    })

    it('resolves filtered audience using unified server-side filters', async () => {
      const broadcast: any = {
        id: 'b-filt',
        audience: 'filtered',
        recipientFilters: { verificationStatus: 'verified' },
      }
      const recipients = await InAppManagerService.resolveRecipients(broadcast)
      // Only usr-1 and usr-2 are verified
      expect(recipients).toEqual(['usr-1', 'usr-2'])
    })

    it('resolves all learners by default', async () => {
      const broadcast: any = {
        id: 'b-all',
        audience: 'all',
      }
      const recipients = await InAppManagerService.resolveRecipients(broadcast)
      expect(recipients).toEqual(['usr-1', 'usr-2', 'usr-3'])
    })
  })

  describe('Execution, Delivery & Idempotency', () => {
    it('executes in-app notification dispatch and creates user inbox rows', async () => {
      const broadcast = await InAppManagerService.createBroadcast({
        title: 'System Maintenance Window',
        body: 'Scheduled database indexing tonight at 2 AM UTC.',
        category: 'security',
        priority: 'urgent',
        audience: 'all',
      })

      const res = await InAppManagerService.executeBroadcast(broadcast.id)
      expect(res.success).toBe(true)
      expect(res.targeted).toBe(3)
      expect(res.delivered).toBe(3)

      // Verify in_app_notifications rows created
      expect(mockDb.inAppNotifications.length).toBe(3)
      const user1Notif = mockDb.inAppNotifications.find((n) => n.user_id === 'usr-1')
      expect(user1Notif).toBeDefined()
      expect(user1Notif?.title).toBe('System Maintenance Window')
      expect(user1Notif?.priority).toBe(1) // Urgent numeric
      expect(user1Notif?.is_read).toBe(false)
      expect(user1Notif?.idempotency_key).toBe(`inapp-${broadcast.id}-usr-1`)

      // Verify broadcast record updated to completed
      const updated = await InAppManagerService.getBroadcast(broadcast.id)
      expect(updated?.status).toBe('completed')
      expect(updated?.totalDelivered).toBe(3)
    })

    it('prevents duplicate delivery if broadcast is executed twice', async () => {
      const broadcast = await InAppManagerService.createBroadcast({
        title: 'Duplicate Test Alert',
        body: 'Should not deliver twice.',
        audience: 'all',
      })

      await InAppManagerService.executeBroadcast(broadcast.id)
      expect(mockDb.inAppNotifications.length).toBe(3)

      // Attempt second execution
      const secondExec = await InAppManagerService.executeBroadcast(broadcast.id)
      expect(secondExec.success).toBe(false)
      expect(secondExec.error).toContain('already completed')
      expect(mockDb.inAppNotifications.length).toBe(3) // No duplicates
    })
  })

  describe('Lifecycle Controls: Schedule, Pause, Resume, Cancel & Delete', () => {
    it('pauses and resumes scheduled notifications', async () => {
      const item = await InAppManagerService.createBroadcast({
        title: 'Future Feature Preview',
        body: 'Check out the new AI Case Study simulator.',
        scheduledAt: new Date(Date.now() + 100000).toISOString(),
      })
      expect(item.status).toBe('scheduled')

      // Pause
      const pauseRes = await InAppManagerService.pauseBroadcast(item.id)
      expect(pauseRes.success).toBe(true)
      const pausedItem = await InAppManagerService.getBroadcast(item.id)
      expect(pausedItem?.status).toBe('paused')

      // Resume
      const resumeRes = await InAppManagerService.resumeBroadcast(item.id)
      expect(resumeRes.success).toBe(true)
      const resumedItem = await InAppManagerService.getBroadcast(item.id)
      expect(resumedItem?.status).toBe('scheduled')
    })

    it('cancels scheduled notifications', async () => {
      const item = await InAppManagerService.createBroadcast({
        title: 'Cancelled Event',
        body: 'This notification is cancelled.',
        scheduledAt: new Date(Date.now() + 100000).toISOString(),
      })

      const cancelRes = await InAppManagerService.cancelBroadcast(item.id)
      expect(cancelRes.success).toBe(true)
      const cancelledItem = await InAppManagerService.getBroadcast(item.id)
      expect(cancelledItem?.status).toBe('cancelled')
      expect(cancelledItem?.scheduledAt).toBeNull()
    })

    it('deletes draft and cancelled notifications', async () => {
      const item = await InAppManagerService.createBroadcast({
        title: 'Draft to Delete',
        body: 'Testing deletion.',
      })

      const delRes = await InAppManagerService.deleteBroadcast(item.id)
      expect(delRes.success).toBe(true)
      const deleted = await InAppManagerService.getBroadcast(item.id)
      expect(deleted).toBeNull()
    })
  })

  describe('Cron Scheduled Processor', () => {
    it('executes scheduled notifications that have reached their scheduled_at time', async () => {
      const pastDate = new Date(Date.now() - 60000).toISOString()
      const item = await InAppManagerService.createBroadcast({
        title: 'Cron Scheduled Dispatch',
        body: 'Processed by server cron.',
        scheduledAt: pastDate,
        status: 'scheduled',
        audience: 'all',
      })

      const cronResult = await InAppManagerService.processScheduledInAppBroadcasts()
      expect(cronResult.processed).toBe(1)
      expect(cronResult.errors.length).toBe(0)

      const executed = await InAppManagerService.getBroadcast(item.id)
      expect(executed?.status).toBe('completed')
      expect(mockDb.inAppNotifications.length).toBe(3)
    })
  })

  describe('Event-Driven Notifications Preservation', () => {
    it('preserves automated event notification generation and formatting', () => {
      const lessonEvent = buildInAppContentFromEvent({
        id: 'evt-1',
        event: 'lesson.completed',
        userId: 'usr-1',
        userEmail: 'alice@example.com',
        userName: 'Alice',
        userTimezone: 'UTC',
        occurredAt: new Date().toISOString(),
        priority: 'medium',
        category: 'learning',
        payload: { lessonTitle: 'Product Discovery & MVP Strategy', xpEarned: 100 },
      })

      expect(lessonEvent.title).toBe('Product Discovery & MVP Strategy')
      expect(lessonEvent.body).toContain('+100 XP')
      expect(lessonEvent.actionUrl).toBe('/academy')

      const badgeEvent = buildInAppContentFromEvent({
        id: 'evt-2',
        event: 'badge.earned',
        userId: 'usr-1',
        userEmail: 'alice@example.com',
        userName: 'Alice',
        userTimezone: 'UTC',
        occurredAt: new Date().toISOString(),
        priority: 'high',
        category: 'achievements',
        payload: { badgeName: 'CPO Mastery', badgeDescription: 'Master of Product Strategy' },
      })

      expect(badgeEvent.title).toBe('Badge earned: CPO Mastery')
      expect(badgeEvent.actionUrl).toBe('/badges')
    })
  })
})
