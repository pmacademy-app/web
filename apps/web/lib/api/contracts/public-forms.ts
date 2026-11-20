/**
 * Client-safe request body schemas for the contact, feedback, testimonial and
 * resend-verification forms.
 *
 * These routes throttle before they read the body, so they parse in the handler with
 * `parseBody` rather than declaring `body:` on the wrapper. The schemas check types,
 * unknown keys and outer size caps only; the routes keep their own "X is required"
 * copy and their existing trim-and-truncate, so every message the forms show is
 * unchanged. Caps sit well above each route's truncation length, so a long but real
 * submission is still truncated as before, never refused.
 */
import { z } from 'zod'

// ─── POST /api/contact (components/contact/ContactForm.tsx) ────────────────────

export const contactSubmitBodySchema = z
  .object({
    name: z.string().max(1000).optional(),
    email: z.string().max(1000).optional(),
    subject: z.string().max(2000).optional(),
    category: z.string().max(200).optional(),
    message: z.string().max(20_000, 'Message must be 20,000 characters or fewer.').optional(),
  })
  .strict()

// ─── POST /api/feedback (components/feedback/ContextualFeedbackModal.tsx) ──────

export const feedbackSubmitBodySchema = z
  .object({
    action: z.literal('dismiss').optional(),
    promptKey: z.string().max(100).optional(),
    content: z.string().max(20_000, 'Feedback must be 20,000 characters or fewer.').optional(),
    category: z.string().max(200).optional(),
    sourceEvent: z.string().max(200).optional(),
    rating: z.number().nullable().optional(),
    pageUrl: z.string().max(2000).optional(),
  })
  .strict()

// ─── POST /api/testimonials (components/feedback/ContextualFeedbackModal.tsx) ──

export const testimonialSubmitBodySchema = z
  .object({
    content: z.string().max(20_000, 'Review must be 20,000 characters or fewer.').optional(),
    rating: z.number().nullable().optional(),
    headline: z.string().max(1000).optional(),
    authorName: z.string().max(1000).optional(),
    authorRole: z.string().max(1000).optional(),
    allowPublicFeature: z.boolean().optional(),
  })
  .strict()

// ─── POST /api/auth/resend-verification (components/auth/ResendVerificationCard.tsx)

/**
 * Not strict: the body is optional by design and only these two fields are read.
 * The type check is what matters, since a non-string email used to reach `.trim()`.
 */
export const resendVerificationBodySchema = z.object({
  email: z.string().max(320).optional(),
  turnstileToken: z.string().max(4096).optional(),
})
