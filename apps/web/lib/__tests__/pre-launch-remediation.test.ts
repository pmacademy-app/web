import { describe, it, expect, vi, beforeEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import {
  getCanonicalPrerequisiteRange,
  getFirstActionableLessonIndex,
  resolveModuleCtaTarget,
} from '../curriculum-access'
import { FeedbackAdminService } from '../admin/feedback-service'
import { logAdminAction } from '../admin/guard'
import * as supabaseModule from '../supabase'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import type { CurriculumEntry } from '@/types'

describe('Pre-Launch Remediation & Integrity Verification Suite', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  // ===========================================================================
  // 1. P1-A: Next.js 16 Request Interception & Proxy Entrypoint
  // ===========================================================================
  describe('P1-A: Request Interception & Next.js 16 Proxy Entrypoint', () => {
    it('proxy.ts exists and exports proxy function and matcher config for Next.js 16', async () => {
      const proxyModule = await import('../../proxy')
      expect(proxyModule.proxy).toBeDefined()
      expect(typeof proxyModule.proxy).toBe('function')
      expect(proxyModule.config).toBeDefined()
      expect(Array.isArray(proxyModule.config.matcher)).toBe(true)
      expect(proxyModule.config.matcher.length).toBeGreaterThan(0)
    })

    it('proxy executes and attaches referral cookie when ?ref= is present', async () => {
      const { proxy } = await import('../../proxy')
      const { NextRequest } = await import('next/server')

      const req = new NextRequest('https://prodily.app/signup?ref=growth_hacker')
      const res = await proxy(req)

      expect(res).toBeDefined()
      const cookie = res.cookies.get('prodily_referrer')
      expect(cookie).toBeDefined()
      expect(cookie?.value).toBe('growth_hacker')
    })
  })

  // ===========================================================================
  // 2. P1-B: GitHub Actions Production Scheduler & Vercel Cleanliness
  // ===========================================================================
  describe('P1-B: GitHub Actions Production Scheduler & Vercel Cleanliness', () => {
    it('notification-scheduler.yml specifies triggers for all 6 production cron endpoints', () => {
      const workflowPath = path.resolve(__dirname, '../../../../.github/workflows/notification-scheduler.yml')
      expect(fs.existsSync(workflowPath)).toBe(true)

      const content = fs.readFileSync(workflowPath, 'utf-8')

      // All 6 cron endpoints must be covered
      expect(content).toContain('/api/cron/process-email-queue')
      expect(content).toContain('/api/cron/process-broadcasts')
      expect(content).toContain('/api/cron/retry-failed')
      expect(content).toContain('/api/cron/daily-reminder')
      expect(content).toContain('/api/cron/weekly-recap')
      expect(content).toContain('/api/cron/cleanup')

      // Authentication via CRON_SECRET Bearer header
      expect(content).toContain('Authorization: Bearer ${{ secrets.CRON_SECRET }}')

      // IST-converted schedules in UTC:
      expect(content).toContain("- cron: '*/5 * * * *'")  // 5-min continuous
      expect(content).toContain("- cron: '30 * * * *'")   // Hourly at :00 IST
      expect(content).toContain("- cron: '30 3 * * *'")   // Daily 09:00 AM IST (03:30 UTC)
      expect(content).toContain("- cron: '30 3 * * 1'")   // Monday 09:00 AM IST (03:30 UTC)
      expect(content).toContain("- cron: '30 20 * * *'")  // Daily 02:00 AM IST (20:30 UTC)
    })

    it('vercel.json is clean and does not contain duplicate Vercel Cron definitions', () => {
      const vercelJsonPath = path.resolve(__dirname, '../../vercel.json')
      expect(fs.existsSync(vercelJsonPath)).toBe(true)

      const raw = fs.readFileSync(vercelJsonPath, 'utf-8')
      const parsed = JSON.parse(raw)

      expect(parsed.framework).toBe('nextjs')
      expect(parsed.crons).toBeUndefined()
    })
  })

  // ===========================================================================
  // 3. P1-C & P2-A: Admin Audit Log & Feedback Schema Alignment
  // ===========================================================================
  describe('P2-A: Feedback Database Schema Alignment', () => {
    it('updateFeedbackStatus updates { status } without sending non-existent updated_at column', async () => {
      let feedbackUpdatePayload: Record<string, unknown> | null = null

      const mockSupabase = {
        from: (table: string) => {
          if (table === 'user_feedback') {
            return {
              update: (payload: Record<string, unknown>) => {
                feedbackUpdatePayload = payload
                return {
                  eq: () => Promise.resolve({ error: null }),
                }
              },
            }
          }
          return {
            insert: () => Promise.resolve({ error: null }),
            update: () => ({ eq: () => Promise.resolve({ error: null }) }),
          }
        },
      } as unknown as SupabaseClient<Database>

      vi.spyOn(supabaseModule, 'createServiceRoleClient').mockReturnValue(mockSupabase)

      const result = await FeedbackAdminService.updateFeedbackStatus(
        'admin-uuid-1',
        'admin@prodily.app',
        'fb-uuid-123',
        'reviewed'
      )

      expect(result.success).toBe(true)
      expect(feedbackUpdatePayload).toEqual({ status: 'reviewed' })
      expect((feedbackUpdatePayload as Record<string, unknown> | null)?.updated_at).toBeUndefined()
    })

    it('logAdminAction writes audit records to admin_audit_logs with full metadata', async () => {
      let insertedRow: Record<string, unknown> | null = null
      let targetTable: string | null = null

      const mockSupabase = {
        from: (table: string) => {
          targetTable = table
          return {
            insert: (row: Record<string, unknown>) => {
              insertedRow = row
              return Promise.resolve({ error: null })
            },
          }
        },
      } as unknown as SupabaseClient<Database>

      vi.spyOn(supabaseModule, 'createServiceRoleClient').mockReturnValue(mockSupabase)

      await logAdminAction(
        'admin-uuid-1',
        'admin@prodily.app',
        'feedback_status_reviewed',
        'feedback',
        'fb-123',
        { status: 'reviewed' }
      )

      expect(targetTable).toBe('admin_audit_logs')
      expect(insertedRow).toEqual({
        admin_user_id: 'admin-uuid-1',
        admin_email: 'admin@prodily.app',
        action: 'feedback_status_reviewed',
        target_resource: 'feedback',
        target_id: 'fb-123',
        metadata: { status: 'reviewed' },
      })
    })
  })

  // ===========================================================================
  // 4. P2-B: Usage Time Tracker Canonical Hook
  // ===========================================================================
  describe('P2-B: Usage Time Tracker Canonical Hook Consolidation', () => {
    it('both import paths resolve the canonical useUsageTimeTracker hook', async () => {
      const hook1 = await import('../../hooks/useUsageTimeTracker')
      const hook2 = await import('../../lib/hooks/useUsageTimeTracker')

      expect(hook1.useUsageTimeTracker).toBeDefined()
      expect(hook2.useUsageTimeTracker).toBeDefined()
      expect(hook1.useUsageTimeTracker).toBe(hook2.useUsageTimeTracker)
    })
  })

  // ===========================================================================
  // 5. CURR: Generic Curriculum Prerequisite Invariant Across All 90 Lessons
  // ===========================================================================
  describe('CURR: Generic Curriculum Prerequisite Invariant Across All 90 Lessons', () => {
    const canonicalIds = Array.from({ length: 90 }, (_, i) => `les_${String(i + 1).padStart(3, '0')}`)
    const dummyLessons: CurriculumEntry[] = (canonicalIds.map((id, i) => ({
      id,
      slug: `lesson-${i + 1}`,
      title: `Lesson ${i + 1}`,
      module: `Module ${Math.floor(i / 10) + 1}`,
      moduleSlug: `module-${Math.floor(i / 10) + 1}`,
      moduleTitle: `Module ${Math.floor(i / 10) + 1}`,
      order: i + 1,
      difficulty: 'beginner' as const,
      estimatedMinutes: 15,
      estimatedReadingTime: 15,
      estimatedCompletionTime: 20,
      xpReward: 50,
      description: `Description ${i + 1}`,
      keyTakeaways: [],
      frameworks: [],
      prerequisites: i > 0 ? [canonicalIds[i - 1]] : [],
    })) as unknown) as CurriculumEntry[]

    const testIndices = [
      0,   // Lesson 1
      1,   // Lesson 2
      2,   // Lesson 3
      9,   // Lesson 10
      10,  // Lesson 11
      11,  // Lesson 12
      19,  // Lesson 20
      20,  // Lesson 21
      49,  // Lesson 50
      74,  // Lesson 75
      88,  // Lesson 89
      89,  // Lesson 90
    ]

    it('Scenario A: Brand-new learner (0 completed) — only Lesson 1 accessible', () => {
      const completed = new Set<string>()

      // Lesson 1 (index 0)
      const range0 = getCanonicalPrerequisiteRange(completed, canonicalIds, 0)
      expect(range0.firstIncompleteIndex).toBeNull()
      expect(range0.lastPrerequisiteIndex).toBe(-1)

      // All subsequent test lessons must be locked with firstIncompleteIndex = 0 (Lesson 1)
      testIndices.slice(1).forEach((idx) => {
        const range = getCanonicalPrerequisiteRange(completed, canonicalIds, idx)
        expect(range.firstIncompleteIndex).toBe(0) // Must start at Lesson 1
        expect(range.lastPrerequisiteIndex).toBe(idx - 1)
      })

      expect(getFirstActionableLessonIndex(completed, canonicalIds)).toBe(0)
    })

    it('Scenario B: Contiguous progression up to lesson K — lesson K+1 unlocked, >K+1 locked', () => {
      // Complete lessons 1..10 (indices 0..9)
      const completed10 = new Set(canonicalIds.slice(0, 10))

      // Lesson 11 (index 10) is accessible
      const range10 = getCanonicalPrerequisiteRange(completed10, canonicalIds, 10)
      expect(range10.firstIncompleteIndex).toBeNull()

      // Lesson 12 (index 11) is locked; first incomplete is index 10 (Lesson 11)
      const range11 = getCanonicalPrerequisiteRange(completed10, canonicalIds, 11)
      expect(range11.firstIncompleteIndex).toBe(10)

      // Lesson 50 (index 49) is locked; first incomplete is index 10 (Lesson 11)
      const range49 = getCanonicalPrerequisiteRange(completed10, canonicalIds, 49)
      expect(range49.firstIncompleteIndex).toBe(10)

      expect(getFirstActionableLessonIndex(completed10, canonicalIds)).toBe(10)
    })

    it('Scenario C: Non-contiguous / gap completions — cannot skip missing prerequisites', () => {
      // User completed lessons 1..5, skipped 6..9, completed 10
      const completedWithGap = new Set([
        ...canonicalIds.slice(0, 5),
        canonicalIds[9], // Lesson 10
      ])

      // Lesson 6 (index 5) is accessible
      const range5 = getCanonicalPrerequisiteRange(completedWithGap, canonicalIds, 5)
      expect(range5.firstIncompleteIndex).toBeNull()

      // Lesson 11 (index 10) is locked because lessons 6..9 are incomplete
      const range10 = getCanonicalPrerequisiteRange(completedWithGap, canonicalIds, 10)
      expect(range10.firstIncompleteIndex).toBe(5) // Index 5 = Lesson 6

      // Lesson 90 (index 89) is locked
      const range89 = getCanonicalPrerequisiteRange(completedWithGap, canonicalIds, 89)
      expect(range89.firstIncompleteIndex).toBe(5)

      expect(getFirstActionableLessonIndex(completedWithGap, canonicalIds)).toBe(5)
    })

    it('Scenario D: Fully completed curriculum (90/90) — all accessible', () => {
      const completedAll = new Set(canonicalIds)

      testIndices.forEach((idx) => {
        const range = getCanonicalPrerequisiteRange(completedAll, canonicalIds, idx)
        expect(range.firstIncompleteIndex).toBeNull()
      })

      expect(getFirstActionableLessonIndex(completedAll, canonicalIds)).toBe(-1)
    })

    it('Scenario E: resolveModuleCtaTarget correctly derives actionable CTA without prerequisite bypass', () => {
      const completed = new Set(canonicalIds.slice(0, 10)) // 1..10 completed
      const module2Lessons = dummyLessons.slice(10, 20)     // Module 2 (Lessons 11..20)
      const module5Lessons = dummyLessons.slice(40, 50)     // Module 5 (Lessons 41..50)

      // Module 2 CTA: Lesson 11 is accessible right now
      const ctaMod2 = resolveModuleCtaTarget(module2Lessons, dummyLessons, completed)
      expect(ctaMod2.isAccessible).toBe(true)
      expect(ctaMod2.lesson?.id).toBe('les_011')

      // Module 5 CTA: Lesson 41 is NOT accessible; directs learner to first actionable lesson (Lesson 11)
      const ctaMod5 = resolveModuleCtaTarget(module5Lessons, dummyLessons, completed)
      expect(ctaMod5.isAccessible).toBe(false)
      expect(ctaMod5.lesson?.id).toBe('les_041')
      expect(ctaMod5.firstActionableLesson?.id).toBe('les_011')
    })
  })
})
