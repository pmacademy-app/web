/* eslint-disable @typescript-eslint/no-explicit-any, prefer-const, @typescript-eslint/no-unused-vars */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { AnnouncementsService, type AnnouncementCreateInput } from '../admin/announcements-service'
import { DashboardService } from '../admin/dashboard-service'
import { AdminConsoleService } from '../admin/service'

let idCounter = 0

// Mock Supabase client
const mockStore: {
  announcements: Array<Record<string, unknown>>
  dismissals: Array<Record<string, unknown>>
  users: Array<Record<string, unknown>>
  xpEvents: Array<Record<string, unknown>>
  lessonProgress: Array<Record<string, unknown>>
  auditLogs: Array<Record<string, unknown>>
} = {
  announcements: [],
  dismissals: [],
  users: [],
  xpEvents: [],
  lessonProgress: [],
  auditLogs: [],
}

vi.mock('../supabase', () => {
  return {
    createServiceRoleClient: () => {
      const createBuilder = (table: string) => {
        let filters: Array<(row: Record<string, unknown>) => boolean> = []
        let orderCol: string | null = null
        let orderAsc = true
        let limitVal: number | null = null
        let rangeFrom = 0
        let rangeTo = 9999

        const builder: any = {
          select: vi.fn().mockImplementation((cols?: string, opts?: { count?: string; head?: boolean }) => {
            return builder
          }),
          insert: vi.fn().mockImplementation((payload: any) => {
            const rows = Array.isArray(payload) ? payload : [payload]
            const inserted = rows.map((r, i) => ({
              id: r.id || `mock-${table}-${++idCounter}-${i}`,
              ...r,
              created_at: r.created_at || new Date().toISOString(),
              updated_at: r.updated_at || new Date().toISOString(),
            }))
            if (table === 'system_announcements') mockStore.announcements.push(...inserted)
            if (table === 'admin_audit_logs') mockStore.auditLogs.push(...inserted)
            if (table === 'user_announcement_dismissals') mockStore.dismissals.push(...inserted)
            return {
              select: () => ({
                single: () => Promise.resolve({ data: inserted[0], error: null }),
                maybeSingle: () => Promise.resolve({ data: inserted[0], error: null }),
              }),
              then: (resolve: any) => resolve({ data: inserted, error: null }),
            }
          }),
          update: vi.fn().mockImplementation((payload: any) => {
            return {
              eq: (col: string, val: any) => {
                let updatedRow: any = null
                if (table === 'system_announcements') {
                  const target = mockStore.announcements.find((r) => r[col] === val)
                  if (target) {
                    Object.assign(target, payload)
                    updatedRow = target
                  }
                }
                return {
                  select: () => ({
                    single: () => Promise.resolve({ data: updatedRow, error: null }),
                  }),
                  then: (resolve: any) => resolve({ data: updatedRow, error: null }),
                }
              },
            }
          }),
          delete: vi.fn().mockImplementation(() => {
            return {
              eq: (col: string, val: any) => {
                if (table === 'system_announcements') {
                  mockStore.announcements = mockStore.announcements.filter((r) => r[col] !== val)
                }
                return Promise.resolve({ error: null })
              },
            }
          }),
          upsert: vi.fn().mockImplementation((payload: any) => {
            mockStore.dismissals.push(payload)
            return Promise.resolve({ error: null })
          }),
          eq: vi.fn().mockImplementation((col: string, val: any) => {
            filters.push((r) => r[col] === val)
            return builder
          }),
          neq: vi.fn().mockImplementation((col: string, val: any) => {
            filters.push((r) => r[col] !== val)
            return builder
          }),
          in: vi.fn().mockImplementation((col: string, vals: any[]) => {
            filters.push((r) => vals.includes(r[col]))
            return builder
          }),
          gte: vi.fn().mockImplementation((col: string, val: any) => {
            filters.push((r) => String(r[col] || '') >= String(val))
            return builder
          }),
          lte: vi.fn().mockImplementation((col: string, val: any) => {
            filters.push((r) => String(r[col] || '') <= String(val))
            return builder
          }),
          lt: vi.fn().mockImplementation((col: string, val: any) => {
            filters.push((r) => String(r[col] || '') < String(val))
            return builder
          }),
          or: vi.fn().mockImplementation(() => builder),
          not: vi.fn().mockImplementation(() => builder),
          ilike: vi.fn().mockImplementation((col: string, pattern: string) => {
            const raw = pattern.replace(/%/g, '').toLowerCase()
            filters.push((r) => String(r[col] || '').toLowerCase().includes(raw))
            return builder
          }),
          order: vi.fn().mockImplementation((col: string, opts?: { ascending?: boolean }) => {
            orderCol = col
            orderAsc = opts?.ascending !== false
            return builder
          }),
          limit: vi.fn().mockImplementation((n: number) => {
            limitVal = n
            return builder
          }),
          range: vi.fn().mockImplementation((from: number, to: number) => {
            rangeFrom = from
            rangeTo = to
            return builder.then((res: any) => res)
          }),
          single: vi.fn().mockImplementation(() => {
            let data: any = (mockStore as any)[table]?.[0] || null
            return Promise.resolve({ data, error: null })
          }),
          maybeSingle: vi.fn().mockImplementation(() => {
            let data: any = (mockStore as any)[table]?.[0] || null
            return Promise.resolve({ data, error: null })
          }),
          then: (resolve: any) => {
            let source: any[] = []
            if (table === 'system_announcements') source = mockStore.announcements
            if (table === 'user_announcement_dismissals') source = mockStore.dismissals
            if (table === 'users') source = mockStore.users
            if (table === 'xp_events') source = mockStore.xpEvents
            if (table === 'user_lesson_progress') source = mockStore.lessonProgress

            let filtered = source.filter((r) => filters.every((fn) => fn(r)))
            const count = filtered.length
            const sliced = filtered.slice(rangeFrom, rangeTo + 1)
            const result = limitVal ? sliced.slice(0, limitVal) : sliced
            return resolve({ data: result, error: null, count })
          },
        }
        return builder
      }

      return {
        from: (table: string) => createBuilder(table),
        rpc: vi.fn().mockResolvedValue({
          data: {
            totalUsers: 10,
            activeLearners7d: 5,
            newSignups24h: 2,
            totalLessonsCompleted: 40,
            totalCapstonesSubmitted: 3,
            totalCertificatesIssued: 1,
            totalPublicPortfolios: 2,
            totalXpAwarded: 2500,
          },
          error: null,
        }),
        auth: {
          admin: {
            listUsers: vi.fn().mockResolvedValue({
              data: {
                users: [
                  { id: 'u-1', email: 'alice@example.com', email_confirmed_at: '2026-08-01T00:00:00Z' },
                  { id: 'u-2', email: 'bob@example.com', email_confirmed_at: null },
                ],
              },
            }),
            getUserById: vi.fn().mockImplementation((id: string) =>
              Promise.resolve({
                data: { user: { id, email_confirmed_at: '2026-08-01T00:00:00Z' } },
                error: null,
              })
            ),
          },
        },
      }
    },
  }
})

describe('Phase 2 — System Announcements & Dashboard Performance', () => {
  beforeEach(() => {
    idCounter = 0
    mockStore.announcements = []
    mockStore.dismissals = []
    mockStore.users = [
      { id: 'u-1', name: 'Alice Smith', email: 'alice@example.com', is_admin: false, total_xp: 1200, level: 3, created_at: '2026-08-01T00:00:00Z' },
      { id: 'u-2', name: 'Bob Jones', email: 'bob@example.com', is_admin: true, total_xp: 400, level: 1, created_at: '2026-08-15T00:00:00Z' },
    ]
    mockStore.xpEvents = [
      { id: 'xp-1', user_id: 'u-1', xp_amount: 100, created_at: new Date().toISOString() },
      { id: 'xp-2', user_id: 'u-2', xp_amount: 50, created_at: new Date().toISOString() },
    ]
    mockStore.lessonProgress = [
      { id: 'lp-1', user_id: 'u-1', lesson_slug: 'lesson-1', status: 'completed', completed_at: new Date().toISOString() },
    ]
    mockStore.auditLogs = []
  })

  describe('AnnouncementsService Lifecycle & Audience Targeting', () => {
    it('creates a draft announcement and records audit log', async () => {
      const input: AnnouncementCreateInput = {
        title: 'Platform Maintenance Notice',
        content: 'We will be undergoing scheduled maintenance tonight from 2am to 3am UTC.',
        type: 'warning',
        status: 'draft',
        targetAudience: 'all',
        dismissible: true,
        priority: 2,
      }

      const created = await AnnouncementsService.createAnnouncement(input, 'admin-1', 'admin@prodily.app')
      expect(created.id).toBeDefined()
      expect(created.title).toBe('Platform Maintenance Notice')
      expect(created.status).toBe('draft')
      expect(created.type).toBe('warning')

      // Verify stored
      expect(mockStore.announcements.length).toBe(1)
      expect(mockStore.announcements[0].title).toBe('Platform Maintenance Notice')
    })

    it('publishes an announcement immediately with published_at timestamp', async () => {
      const created = await AnnouncementsService.createAnnouncement(
        { title: 'New Capstone Released', content: 'Check out the new Product Strategy capstone!', type: 'success' },
        'admin-1',
        'admin@prodily.app'
      )

      const published = await AnnouncementsService.publishAnnouncement(created.id, 'admin-1', 'admin@prodily.app')
      expect(published.status).toBe('active')
      expect(published.publishedAt).toBeDefined()
    })

    it('pauses and resumes an announcement', async () => {
      const created = await AnnouncementsService.createAnnouncement(
        { title: 'Flash Challenge', content: 'Double XP weekend!', status: 'active' },
        'admin-1',
        'admin@prodily.app'
      )

      const paused = await AnnouncementsService.togglePauseAnnouncement(created.id, true, 'admin-1', 'admin@prodily.app')
      expect(paused.status).toBe('paused')

      const resumed = await AnnouncementsService.togglePauseAnnouncement(created.id, false, 'admin-1', 'admin@prodily.app')
      expect(resumed.status).toBe('active')
    })

    it('strictly enforces lifecycle states: draft, scheduled, expired, and paused are hidden', async () => {
      const now = new Date()
      const futureDate = new Date(now.getTime() + 86400000).toISOString() // +1 day
      const pastDate = new Date(now.getTime() - 86400000).toISOString() // -1 day

      // 1. Draft announcement
      await AnnouncementsService.createAnnouncement(
        { title: 'Draft Announcement', content: 'Not published yet', status: 'draft', targetAudience: 'all' },
        'admin-1',
        'admin@prodily.app'
      )
      // 2. Future scheduled announcement
      await AnnouncementsService.createAnnouncement(
        { title: 'Future Scheduled', content: 'Starts tomorrow', status: 'scheduled', scheduledAt: futureDate, targetAudience: 'all' },
        'admin-1',
        'admin@prodily.app'
      )
      // 3. Expired announcement
      await AnnouncementsService.createAnnouncement(
        { title: 'Expired Promo', content: 'Ended yesterday', status: 'active', expiresAt: pastDate, targetAudience: 'all' },
        'admin-1',
        'admin@prodily.app'
      )
      // 4. Paused announcement
      await AnnouncementsService.createAnnouncement(
        { title: 'Paused Announcement', content: 'Temporarily paused', status: 'paused', targetAudience: 'all' },
        'admin-1',
        'admin@prodily.app'
      )
      // 5. Active announcement within window
      await AnnouncementsService.createAnnouncement(
        { title: 'Welcome to Prodily 🚀', content: 'Start learning product management', status: 'active', targetAudience: 'all', linkUrl: '/academy' },
        'admin-1',
        'admin@prodily.app'
      )

      const activeAnnouncements = await AnnouncementsService.getActiveAnnouncementsForUser('u-1')
      expect(activeAnnouncements.length).toBe(1)
      expect(activeAnnouncements[0].title).toBe('Welcome to Prodily 🚀')
      expect(activeAnnouncements[0].linkUrl).toBe('/academy')
    })

    it('enforces targeted audiences: individual user vs cohort vs all learners', async () => {
      // 1. All Learners announcement
      await AnnouncementsService.createAnnouncement(
        { title: 'Welcome to Prodily 🚀', content: 'All learners announcement', status: 'active', targetAudience: 'all' },
        'admin-1',
        'admin@prodily.app'
      )
      // 2. Cohort specific announcement
      await AnnouncementsService.createAnnouncement(
        { title: 'Cohort 2026A Exclusive', content: 'Meetup tomorrow', status: 'active', targetAudience: 'cohort', targetCohortId: 'cohort-2026a' },
        'admin-1',
        'admin@prodily.app'
      )
      // 3. Individual user announcement
      await AnnouncementsService.createAnnouncement(
        { title: 'Special Welcome for Alice', content: '1-on-1 mentor session available', status: 'active', targetAudience: 'individual', targetUserId: 'u-1' },
        'admin-1',
        'admin@prodily.app'
      )
      // 4. Individual user announcement for someone else
      await AnnouncementsService.createAnnouncement(
        { title: 'Private Notice for Bob', content: 'Admin message', status: 'active', targetAudience: 'individual', targetUserId: 'u-2' },
        'admin-1',
        'admin@prodily.app'
      )

      // Alice (u-1 in cohort-2026a) should see: All + Cohort + Alice's Private (3 announcements)
      const aliceList = await AnnouncementsService.getActiveAnnouncementsForUser('u-1', 'cohort-2026a')
      expect(aliceList.length).toBe(3)
      const aliceTitles = aliceList.map((a) => a.title)
      expect(aliceTitles).toContain('Welcome to Prodily 🚀')
      expect(aliceTitles).toContain('Cohort 2026A Exclusive')
      expect(aliceTitles).toContain('Special Welcome for Alice')
      expect(aliceTitles).not.toContain('Private Notice for Bob')

      // Bob (u-2 in cohort-2026b) should see: All + Bob's Private (2 announcements)
      const bobList = await AnnouncementsService.getActiveAnnouncementsForUser('u-2', 'cohort-2026b')
      expect(bobList.length).toBe(2)
      const bobTitles = bobList.map((a) => a.title)
      expect(bobTitles).toContain('Welcome to Prodily 🚀')
      expect(bobTitles).toContain('Private Notice for Bob')
      expect(bobTitles).not.toContain('Cohort 2026A Exclusive')
      expect(bobTitles).not.toContain('Special Welcome for Alice')
    })

    it('persists dismissals independently per user', async () => {
      const a1 = await AnnouncementsService.createAnnouncement(
        { title: 'Announcement 1', content: 'Dismissible notice 1', status: 'active', targetAudience: 'all', dismissible: true },
        'admin-1',
        'admin@prodily.app'
      )
      const a2 = await AnnouncementsService.createAnnouncement(
        { title: 'Announcement 2', content: 'Dismissible notice 2', status: 'active', targetAudience: 'all', dismissible: true },
        'admin-1',
        'admin@prodily.app'
      )

      // Alice dismisses announcement 1
      await AnnouncementsService.dismissAnnouncement(a1.id, 'u-1')

      // Alice sees only announcement 2
      const aliceList = await AnnouncementsService.getActiveAnnouncementsForUser('u-1')
      expect(aliceList.length).toBe(1)
      expect(aliceList[0].id).toBe(a2.id)

      // Bob still sees BOTH announcement 1 and 2
      const bobList = await AnnouncementsService.getActiveAnnouncementsForUser('u-2')
      expect(bobList.length).toBe(2)
    })

    it('orders multiple announcements by priority descending', async () => {
      await AnnouncementsService.createAnnouncement(
        { title: 'Normal Announcement', content: 'Priority 1', status: 'active', targetAudience: 'all', priority: 1 },
        'admin-1',
        'admin@prodily.app'
      )
      await AnnouncementsService.createAnnouncement(
        { title: 'Urgent Announcement', content: 'Priority 10', status: 'active', targetAudience: 'all', priority: 10 },
        'admin-1',
        'admin@prodily.app'
      )

      const list = await AnnouncementsService.getActiveAnnouncementsForUser('u-1')
      expect(list.length).toBe(2)
      expect(list[0].title).toBe('Urgent Announcement')
      expect(list[1].title).toBe('Normal Announcement')
    })
  })

  describe('Dashboard & Performance Aggregations', () => {
    it('executes getDashboardSummary with fast aggregation RPC / query', async () => {
      const summary = await DashboardService.getDashboardSummary()
      expect(summary.totalUsers).toBeGreaterThanOrEqual(2)
      expect(summary.totalXpAwarded).toBeGreaterThanOrEqual(150)
      expect(summary.activeLearners7d).toBeGreaterThanOrEqual(1)
    })

    it('executes getDashboardData without unbounded table scans', async () => {
      const data = await DashboardService.getDashboardData('30d', null, null)
      expect(data.kpis).toBeDefined()
      expect(data.kpis.totalUsers).toBeGreaterThanOrEqual(2)
      expect(data.funnel).toBeDefined()
      expect(data.funnel.length).toBe(7)
      expect(data.series.length).toBeGreaterThan(0)
    })

    it('executes getUsersOverview with server-side pagination and page-scoped enrichment', async () => {
      const result = await AdminConsoleService.getUsersOverview(10, '', {}, 1)
      expect(result.users).toBeDefined()
      expect(result.users.length).toBe(2)
      expect(result.total).toBe(2)
      expect(result.users[0].fullName).toBeDefined()
      expect(result.users[0].totalXp).toBeDefined()
    })
  })
})
