/**
 * Client-safe request body schemas for learner write endpoints.
 *
 * Each schema matches the payload its caller builds today (named next to each one).
 * None of them carries a user id: the row owner always comes from the session.
 * No server imports.
 */
import { z } from 'zod'

// ─── POST /api/capstones/[module]/draft (hooks/useCapstoneAutosave.ts) ─────────

/**
 * Twice the 100k submit ceiling, so a learner trimming an over-long draft can still
 * autosave while editing it down. The submit route enforces the real limit.
 */
export const MAX_CAPSTONE_DRAFT_CHARS = 200_000

export const capstoneDraftBodySchema = z
  .object({
    content: z
      .string({ error: 'Content payload must be a string.' })
      .max(
        MAX_CAPSTONE_DRAFT_CHARS,
        `Draft must be ${MAX_CAPSTONE_DRAFT_CHARS.toLocaleString('en-US')} characters or fewer.`
      ),
  })
  .strict()

// ─── POST /api/certificates (no browser caller; the issue flow calls the lib) ──

export const certificateIssueBodySchema = z
  .object({
    type: z.string().max(40).optional(),
    moduleSlug: z.string().max(100).nullable().optional(),
  })
  .strict()

// ─── POST /api/feedback/eligibility (hooks/useUsageTimeTracker.ts) ─────────────

/** The route clamps the value to 0..300 itself; the schema only checks the type. */
export const feedbackEligibilitySyncSchema = z
  .object({
    incrementSeconds: z.number().nullable().optional(),
  })
  .strict()

// ─── POST /api/leaderboard (components/leaderboard/LeaderboardHeader.tsx) ──────

export const leaderboardOptInBodySchema = z
  .object({
    isOptedIn: z.boolean().optional(),
  })
  .strict()

// ─── PATCH /api/notifications (components/notifications/NotificationCenterDrawer.tsx)

/** The drawer marks one page (20) at a time; 200 leaves room without allowing a flood. */
export const MAX_NOTIFICATION_IDS = 200

export const notificationsPatchBodySchema = z
  .object({
    action: z.enum(['mark_read', 'mark_unread', 'mark_all_read']).optional(),
    notificationId: z.string().min(1).max(100).optional(),
    notificationIds: z
      .array(z.string().min(1).max(100))
      .max(MAX_NOTIFICATION_IDS, `At most ${MAX_NOTIFICATION_IDS} notifications can be updated at once.`)
      .optional(),
  })
  .strict()

// ─── POST /api/reflections (app/(app)/academy/[moduleSlug]/[lessonId]/lesson-content.tsx)

// L9: far above any real reflection, low enough that a scripted write cannot store
// megabytes per row. Capstone reflections share the 10k ceiling with the submit route.
export const MAX_REFLECTION_CHARS = 10_000

const reflectionFieldsSchema = z
  .object({
    // A stable les_XXXXXX id or `capstone-<moduleSlug>`; recordReflectionAction checks the
    // target is real and open to the learner before anything is written or awarded.
    lesson_id: z.string().min(1).max(200),
    content: z
      .string()
      .min(1, 'Reflection content cannot be empty')
      .max(MAX_REFLECTION_CHARS, `Reflection must be ${MAX_REFLECTION_CHARS.toLocaleString('en-US')} characters or fewer.`),
    is_public: z.boolean().default(false),
  })
  .strict()

/** Legacy v1 clients send `lesson_slug`; it is folded into `lesson_id` before the check. */
export const reflectionWriteBodySchema = z.preprocess((raw) => {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return raw
  const { lesson_slug, ...rest } = raw as Record<string, unknown>
  return { ...rest, lesson_id: rest.lesson_id ?? lesson_slug }
}, reflectionFieldsSchema)

// ─── POST /api/review/complete (components/review/ReviewHub.tsx) ───────────────

/**
 * Numbers only; the route still clamps them (500 cards, 5000 XP), which is the
 * abuse control. Nullable because `JSON.stringify(NaN)` sends null.
 */
export const reviewCompleteBodySchema = z
  .object({
    cardsReviewedCount: z.number().nullable().optional(),
    xpEarned: z.number().nullable().optional(),
  })
  .strict()

// ─── PATCH /api/v2/lessons/[lessonId]/progress (hooks/use-lesson-progress-v2.ts)

// Two mutually-exclusive PATCH shapes: the existing "mark in progress", and the Phase 4
// (§4.4) idempotent "deep dive opened" marker. Each member is strict, so neither can
// smuggle the other's field.
export const lessonProgressPatchBodySchema = z.union([
  z.object({ status: z.literal('in_progress') }).strict(),
  z.object({ deep_dive_opened: z.literal(true) }).strict(),
])

// ─── POST /api/user/avatar, JSON branch (multipart is the browser's path) ──────

/** 2MB of image as base64 is about 2.8M characters, plus a data-URL prefix. */
export const MAX_AVATAR_BASE64_CHARS = 3_000_000

export const avatarJsonUploadBodySchema = z
  .object({
    base64: z.string().max(MAX_AVATAR_BASE64_CHARS, 'Image file size exceeds maximum limit of 2MB.').optional(),
    mimeType: z.string().max(100).optional(),
    fileName: z.string().max(255).optional(),
  })
  .strict()
