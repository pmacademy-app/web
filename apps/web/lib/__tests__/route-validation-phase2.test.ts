/**
 * Route validation, phase 2.
 *
 * Every body schema added for the hand-parsed routes accepts the payload its real
 * client builds today and refuses a bad one (wrong type, unknown key where strict,
 * oversize array or string). The six previously unthrottled write handlers declare
 * a per-learner rate limit through the wrapper.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

import { BODY_OBJECT_EXPECTED, parseBody } from '@/lib/api/contracts/body'
import {
  avatarJsonUploadBodySchema,
  capstoneDraftBodySchema,
  certificateIssueBodySchema,
  feedbackEligibilitySyncSchema,
  leaderboardOptInBodySchema,
  lessonProgressPatchBodySchema,
  MAX_CAPSTONE_DRAFT_CHARS,
  MAX_NOTIFICATION_IDS,
  notificationsPatchBodySchema,
  reflectionWriteBodySchema,
  reviewCompleteBodySchema,
} from '@/lib/api/contracts/learner-writes'
import {
  contactSubmitBodySchema,
  feedbackSubmitBodySchema,
  resendVerificationBodySchema,
  testimonialSubmitBodySchema,
} from '@/lib/api/contracts/public-forms'
import {
  changeEmailBodySchema,
  changePasswordBodySchema,
  destructiveReauthBodySchema,
  portfolioSettingsUpdateSchema,
  resetProgressBodySchema,
} from '@/lib/api/contracts/settings'

const API_DIR = path.resolve(import.meta.dirname, '../../app/api')
const routeSource = (relative: string) => readFileSync(path.join(API_DIR, relative), 'utf8')

interface Case {
  name: string
  schema: { safeParse: (input: unknown) => { success: boolean } }
  /** The payload the real client sends, copied from its call site. */
  valid: unknown[]
  invalid: unknown[]
}

const portfolioForm = {
  username: 'ada',
  name: 'Ada Lovelace',
  bio: 'Analyst.',
  avatarUrl: '',
  linkedinUrl: 'https://linkedin.com/in/ada',
  githubUrl: '',
  websiteUrl: '',
  isPortfolioPublic: true,
  portfolioLayout: ['hero', 'radar', 'progress', 'capstones', 'achievements'],
  featuredCapstoneId: null,
  portfolioViewCount: 12,
  verificationOverride: null,
}

const CASES: Case[] = [
  {
    name: 'capstone draft (useCapstoneAutosave)',
    schema: capstoneDraftBodySchema,
    valid: [{ content: 'My draft' }, { content: '' }],
    invalid: [{ content: 42 }, {}, { content: 'x', userId: 'other' }, { content: 'x'.repeat(MAX_CAPSTONE_DRAFT_CHARS + 1) }],
  },
  {
    name: 'certificate issue',
    schema: certificateIssueBodySchema,
    valid: [{}, { type: 'module', moduleSlug: 'discovery' }, { type: 'full_curriculum', moduleSlug: null }],
    invalid: [{ type: 7 }, { userId: 'other' }],
  },
  {
    name: 'feedback eligibility sync (useUsageTimeTracker)',
    schema: feedbackEligibilitySyncSchema,
    valid: [{ incrementSeconds: 300 }, { incrementSeconds: 12.5 }],
    invalid: [{ incrementSeconds: '300' }, { incrementSeconds: 60, userId: 'other' }],
  },
  {
    name: 'leaderboard opt-in (LeaderboardHeader)',
    schema: leaderboardOptInBodySchema,
    valid: [{ isOptedIn: true }, { isOptedIn: false }],
    invalid: [{ isOptedIn: 'yes' }, { isOptedIn: true, userId: 'other' }],
  },
  {
    name: 'notifications mark read (NotificationCenterDrawer)',
    schema: notificationsPatchBodySchema,
    valid: [
      { action: 'mark_read', notificationIds: ['n1', 'n2'] },
      { action: 'mark_read', notificationId: 'n1' },
      { action: 'mark_all_read' },
    ],
    invalid: [
      { action: 'mark_read', notificationIds: 'n1' },
      { action: 'mark_read', notificationId: 'n1', user_id: 'other' },
      { action: 'mark_read', notificationIds: Array.from({ length: MAX_NOTIFICATION_IDS + 1 }, (_, i) => `n${i}`) },
      { action: 'delete_all' },
    ],
  },
  {
    name: 'reflection write (lesson-content)',
    schema: reflectionWriteBodySchema,
    valid: [
      { lesson_id: 'les_000001', content: 'thoughts', is_public: true },
      { lesson_slug: 'legacy-slug', content: 'thoughts' },
    ],
    invalid: [
      { lesson_id: 'les_000001', content: 5 },
      { lesson_id: 'les_000001', content: 'x', user_id: 'other' },
      { lesson_id: 'les_000001', content: 'x'.repeat(10_001) },
      { content: 'no lesson' },
    ],
  },
  {
    name: 'review complete (ReviewHub)',
    schema: reviewCompleteBodySchema,
    valid: [{ cardsReviewedCount: 12, xpEarned: 60 }, {}, { cardsReviewedCount: null, xpEarned: null }],
    invalid: [{ cardsReviewedCount: '12' }, { cardsReviewedCount: 1, userId: 'other' }],
  },
  {
    name: 'lesson progress patch (use-lesson-progress-v2)',
    schema: lessonProgressPatchBodySchema,
    valid: [{ status: 'in_progress' }, { deep_dive_opened: true }],
    invalid: [{ status: 'completed' }, { status: 'in_progress', deep_dive_opened: true }, { deep_dive_opened: 'yes' }],
  },
  {
    name: 'avatar JSON upload',
    schema: avatarJsonUploadBodySchema,
    valid: [{ base64: 'aGVsbG8=', mimeType: 'image/png', fileName: 'a.png' }, {}],
    invalid: [{ base64: 1 }, { base64: 'aGVsbG8=', userId: 'other' }, { mimeType: 'x'.repeat(101) }],
  },
  {
    name: 'contact form (ContactForm)',
    schema: contactSubmitBodySchema,
    valid: [
      { name: 'Ada', email: 'ada@example.com', subject: 'Hi', category: 'general', message: 'Hello' },
      { name: '', email: 'invalid', subject: '', message: '' },
    ],
    invalid: [{ name: 1 }, { name: 'Ada', user_id: 'other' }, { message: 'x'.repeat(20_001) }],
  },
  {
    name: 'feedback (ContextualFeedbackModal)',
    schema: feedbackSubmitBodySchema,
    valid: [
      { action: 'dismiss', promptKey: 'usage_1hr' },
      { content: 'Great', category: 'curriculum', sourceEvent: 'usage_1hr', rating: 5, promptKey: 'usage_1hr' },
    ],
    invalid: [{ content: 7 }, { content: 'x', user_id: 'other' }, { action: 'delete' }],
  },
  {
    name: 'testimonial (ContextualFeedbackModal)',
    schema: testimonialSubmitBodySchema,
    valid: [
      {
        authorName: 'Ada',
        content: 'Loved it',
        rating: 5,
        headline: '',
        authorRole: 'Prodily Learner',
        allowPublicFeature: true,
      },
    ],
    invalid: [{ allowPublicFeature: 'yes' }, { content: 'x', is_published: true }],
  },
  {
    name: 'resend verification (ResendVerificationCard)',
    schema: resendVerificationBodySchema,
    valid: [{ email: 'ada@example.com', turnstileToken: 'tok' }, {}],
    invalid: [{ email: 42 }, { email: 'x'.repeat(321) }],
  },
  {
    name: 'portfolio settings (PortfolioSettingsForm)',
    schema: portfolioSettingsUpdateSchema,
    valid: [
      portfolioForm,
      { ...portfolioForm, featuredCapstoneId: 'cap-1', verificationOverride: 'verified' },
      // A retired section id stored on the row must not block saving; the data layer drops it.
      { ...portfolioForm, portfolioLayout: ['hero', 'retired-section'] },
    ],
    invalid: [
      { ...portfolioForm, isPortfolioPublic: 'yes' },
      { ...portfolioForm, is_admin: true },
      { ...portfolioForm, portfolioLayout: Array.from({ length: 21 }, () => 'hero') },
      { ...portfolioForm, bio: 'x'.repeat(5001) },
    ],
  },
  {
    name: 'destructive re-auth (ConfirmDestructiveAction)',
    schema: destructiveReauthBodySchema,
    valid: [{ currentPassword: 'pw', confirmationPhrase: 'DELETE' }, { confirmationPhrase: 'RESET' }, {}],
    invalid: [{ currentPassword: 123 }, { confirmationPhrase: 'x'.repeat(65) }],
  },
  {
    name: 'reset progress (DangerZoneTab)',
    schema: resetProgressBodySchema,
    valid: [{ module_slug: 'all', currentPassword: 'pw', confirmationPhrase: 'RESET' }],
    invalid: [{ module_slug: 3 }],
  },
  {
    name: 'change email (SecuritySettingsTab)',
    schema: changeEmailBodySchema,
    valid: [{ currentPassword: 'pw', newEmail: 'new@example.com' }],
    invalid: [{ newEmail: 5 }],
  },
  {
    name: 'change password (SecuritySettingsTab)',
    schema: changePasswordBodySchema,
    valid: [{ currentPassword: 'old', newPassword: 'newPassword1', confirmPassword: 'newPassword1' }],
    invalid: [{ newPassword: ['x'] }],
  },
]

describe('route validation phase 2: body schemas', () => {
  for (const { name, schema, valid, invalid } of CASES) {
    it(`${name}: accepts the real client payload`, () => {
      for (const payload of valid) {
        expect(schema.safeParse(payload).success, JSON.stringify(payload).slice(0, 120)).toBe(true)
      }
    })

    it(`${name}: refuses a bad payload`, () => {
      for (const payload of invalid) {
        expect(schema.safeParse(payload).success, JSON.stringify(payload).slice(0, 120)).toBe(false)
      }
    })
  }

  it('folds a legacy lesson_slug into lesson_id', () => {
    const parsed = reflectionWriteBodySchema.safeParse({ lesson_slug: 'legacy', content: 'x' })
    expect(parsed.success && parsed.data).toEqual({ lesson_id: 'legacy', content: 'x', is_public: false })
  })

  it('parseBody gives the wrapper copy for a non-object and the first issue otherwise', () => {
    expect(parseBody(leaderboardOptInBodySchema, null)).toEqual({ ok: false, message: BODY_OBJECT_EXPECTED })
    expect(parseBody(leaderboardOptInBodySchema, [true])).toEqual({ ok: false, message: BODY_OBJECT_EXPECTED })
    expect(parseBody(capstoneDraftBodySchema, {})).toEqual({ ok: false, message: 'Content payload must be a string.' })
    expect(parseBody(leaderboardOptInBodySchema, { isOptedIn: true })).toEqual({ ok: true, data: { isOptedIn: true } })
  })
})

describe('route validation phase 2: routes use the schemas', () => {
  it.each([
    ['capstones/[module]/draft/route.ts', 'body: capstoneDraftBodySchema'],
    ['feedback/eligibility/route.ts', 'body: feedbackEligibilitySyncSchema'],
    ['notifications/route.ts', 'body: notificationsPatchBodySchema'],
    ['reflections/route.ts', 'body: reflectionWriteBodySchema'],
    ['settings/portfolio/route.ts', 'body: portfolioSettingsUpdateSchema'],
    ['certificates/route.ts', 'parseBody(certificateIssueBodySchema'],
    ['leaderboard/route.ts', 'parseBody(leaderboardOptInBodySchema'],
    ['review/complete/route.ts', 'parseBody(reviewCompleteBodySchema'],
    ['contact/route.ts', 'parseBody(contactSubmitBodySchema'],
    ['feedback/route.ts', 'parseBody(feedbackSubmitBodySchema'],
    ['testimonials/route.ts', 'parseBody(testimonialSubmitBodySchema'],
    ['user/avatar/route.ts', 'parseBody(avatarJsonUploadBodySchema'],
    ['settings/delete-account/route.ts', 'parseBody(destructiveReauthBodySchema'],
    ['settings/reset/flashcards/route.ts', 'parseBody(destructiveReauthBodySchema'],
    ['settings/reset/progress/route.ts', 'parseBody(resetProgressBodySchema'],
    ['settings/reset/skill-radar/route.ts', 'parseBody(destructiveReauthBodySchema'],
    ['settings/reset/streak/route.ts', 'parseBody(destructiveReauthBodySchema'],
    ['settings/reset/xp/route.ts', 'parseBody(destructiveReauthBodySchema'],
    ['settings/security/route.ts', 'parseBody(changePasswordBodySchema'],
    ['settings/security/change-email/route.ts', 'parseBody(changeEmailBodySchema'],
    ['auth/resend-verification/route.ts', 'resendVerificationBodySchema.safeParse'],
    ['v2/lessons/[lessonId]/progress/route.ts', 'lessonProgressPatchBodySchema.safeParse'],
  ])('%s validates its body', (relative, needle) => {
    expect(routeSource(relative)).toContain(needle)
  })

  it('no longer casts an unchecked request.json() result in those routes', () => {
    for (const relative of [
      'contact/route.ts',
      'feedback/route.ts',
      'testimonials/route.ts',
      'capstones/[module]/draft/route.ts',
      'notifications/route.ts',
      'review/complete/route.ts',
      'certificates/route.ts',
    ]) {
      expect(routeSource(relative)).not.toMatch(/\(await request\.json\(\)(\.catch\([^)]*\))?\) as /)
    }
  })
})

describe('route validation phase 2: per-learner rate limits on write handlers', () => {
  it.each([
    ['review/complete/route.ts', '`review_complete_${actor.userId}`'],
    ['friends/route.ts', '`friends_add_${actor.userId}`'],
    ['cohorts/route.ts', '`cohorts_membership_${actor.userId}`'],
    ['notifications/celebrations/route.ts', '`celebrations_claim_${actor.userId}`'],
    ['user/quick-start/route.ts', '`quick_start_${actor.userId}`'],
    ['leaderboard/route.ts', '`leaderboard_opt_in_${actor.userId}`'],
  ])('%s declares a rate limit keyed on the learner', (relative, key) => {
    const source = routeSource(relative)
    expect(source).toContain('rateLimit: [')
    expect(source).toContain(key)
    expect(source).toContain("actor.kind === 'learner'")
    expect(source).toMatch(/limit: \d+/)
    expect(source).toMatch(/windowMs: /)
    // These handlers send no email, so a limiter outage must not take them down.
    expect(source).not.toContain('failClosed: true')
    // The wrapper owns the limiter call; a direct import would be a second one.
    expect(source).not.toContain('evaluatePersistentRateLimit')
  })
})
