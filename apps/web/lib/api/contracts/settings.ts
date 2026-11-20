/**
 * Client-safe schemas and contract types for settings endpoints (B10-C).
 *
 * Extracted so that both client components and server route handlers can share
 * schemas and types without leaking server data-layer code (e.g. Supabase
 * service-role client, notifications queue, DB models) into the browser bundle.
 */
import { z } from 'zod'
import { validateWritableUrl } from '@/lib/portfolio/portfolio'

const urlField = (label: string) =>
  z
    .string()
    .max(500, `${label} must be 500 characters or fewer.`)
    .refine((url) => !url || validateWritableUrl(url), {
      message: `${label} must start with https://`,
    })
    .optional()
    .nullable()

export const profileUpdateSchema = z.object({
  name: z.string().max(100, 'Name must be 100 characters or fewer.').optional().nullable(),
  avatar_url: z.string().max(1000).optional().nullable(),
  bio: z.string().max(500, 'Bio must be 500 characters or fewer.').optional().nullable(),
  linkedin_url: urlField('LinkedIn URL'),
  github_url: urlField('GitHub URL'),
  website_url: urlField('Website URL'),
})

export const goalUpdateSchema = z.object({
  weekly_goal_lessons: z.number().int().min(1).max(7).nullable().optional(),
  session_minutes: z.union([z.literal(10), z.literal(15), z.literal(20), z.literal(30), z.literal(45), z.literal(60)]).nullable().optional(),
})

export type GoalUpdateInput = z.infer<typeof goalUpdateSchema>

export interface GoalGetResponse {
  success: boolean
  weekly_goal_lessons: number | null
  session_minutes: number | null
}

export type ProfileUpdateInput = z.infer<typeof profileUpdateSchema>

export interface LearnerProfileData {
  name: string | null
  avatar_url: string | null
  bio: string | null
  linkedin_url: string | null
  github_url: string | null
  website_url: string | null
  is_portfolio_public?: boolean
  username?: string | null
}

export interface ProfileGetResponse {
  success: boolean
  profile: LearnerProfileData | null
}

export interface ProfileUpdateResponse {
  success: boolean
  profile?: LearnerProfileData
  error?: string
}

export interface ChangeEmailGetResponse {
  success: boolean
  email: string
}

export interface ChangeEmailPostResponse {
  success: boolean
  message?: string
  error?: string
}

export interface SecurityUpdateResponse {
  success: boolean
  error?: string
}

export interface ReferredUserSummary {
  id: string
  displayName: string
  joinedAt: string
  status: 'signed_up' | 'activated' | 'rewarded'
  rewardedAt: string | null
}

export interface UserReferralStats {
  referralCode: string
  referralLink: string
  totalInvited: number
  activatedCount: number
  totalXpEarned: number
  /** The reward currently paid per activated referral (admin-configurable). */
  rewardXp: number
  referrals: ReferredUserSummary[]
}

export interface ReferralStatsResponse {
  success: boolean
  stats: UserReferralStats
}

export interface FellowRequestRecord {
  id: string
  status: 'pending' | 'approved' | 'rejected'
  created_at: string
  reviewed_at: string | null
  rejection_reason: string | null
}

export interface FellowStatePayload {
  success: boolean
  isEligible: boolean
  isFellow: boolean
  totalCompleted: number
  requiredCompleted: number
  existingRequest: FellowRequestRecord | null
}

export interface NotificationPreferencesData {
  in_app_enabled?: boolean
  email_enabled?: boolean
  preferred_reminder_hour?: number
  learning_in_app?: boolean
  learning_email?: boolean
  achievements_in_app?: boolean
  achievements_email?: boolean
  security_in_app?: boolean
  security_email?: boolean
  marketing_in_app?: boolean
  marketing_email?: boolean
}

/**
 * The only fields a learner may write through PATCH /api/settings/notifications.
 * Strict, so an unknown key (user_id, unsubscribe_token, ...) is a 400 rather than
 * a column write. The row's owner always comes from the session, never the body.
 */
export const notificationPreferencesUpdateSchema = z
  .object({
    in_app_enabled: z.boolean(),
    email_enabled: z.boolean(),
    all_notifications: z.boolean(),
    preferred_reminder_hour: z.number().int().min(0).max(23),
    learning_in_app: z.boolean(),
    learning_email: z.boolean(),
    achievements_in_app: z.boolean(),
    achievements_email: z.boolean(),
    certificates_in_app: z.boolean(),
    certificates_email: z.boolean(),
    portfolio_in_app: z.boolean(),
    portfolio_email: z.boolean(),
    product_updates_in_app: z.boolean(),
    product_updates_email: z.boolean(),
    security_in_app: z.boolean(),
    security_email: z.boolean(),
    marketing_in_app: z.boolean(),
    marketing_email: z.boolean(),
  })
  .partial()
  .strict()

export type NotificationPreferencesUpdateInput = z.infer<typeof notificationPreferencesUpdateSchema>

export interface NotificationPreferencesResponse {
  success: boolean
  preferences: NotificationPreferencesData
}

// ─── POST /api/settings/portfolio (components/settings/PortfolioSettingsForm.tsx)

/**
 * The form posts its whole `PortfolioSettingsData` state, including the read-only
 * `portfolioViewCount` and `verificationOverride` it got from GET. Those two are
 * accepted so the save keeps working and are never written: the route's data layer
 * builds the update from the editable fields only. Username, URL and avatar rules
 * stay in that layer, which owns the copy the form shows; the schema only checks
 * types and outer size caps. Strict, so no other column can be named.
 */
export const portfolioSettingsUpdateSchema = z
  .object({
    username: z.string().max(100),
    name: z.string().max(200, 'Name must be 200 characters or fewer.'),
    bio: z.string().max(5000, 'Bio must be 5,000 characters or fewer.'),
    avatarUrl: z.string().max(2000),
    linkedinUrl: z.string().max(2000),
    githubUrl: z.string().max(2000),
    websiteUrl: z.string().max(2000),
    isPortfolioPublic: z.boolean(),
    // Any short id, not the enum: GET returns the stored layout unfiltered, so a row
    // holding a retired section id would otherwise block every save. updatePortfolioSettings
    // drops unknown ids before writing.
    portfolioLayout: z.array(z.string().max(40)).max(20).optional(),
    featuredCapstoneId: z.string().max(100).nullable().optional(),
    portfolioViewCount: z.number().optional(),
    verificationOverride: z.enum(['verified', 'rejected']).nullable().optional(),
  })
  .strict()

export type PortfolioSettingsUpdateInput = z.infer<typeof portfolioSettingsUpdateSchema>

// ─── Destructive actions: /api/settings/delete-account, /api/settings/reset/* ──

/**
 * Read in the handler, not declared on the wrapper: an empty body has to reach the
 * re-auth helper so the dialog shows "Current password is required." and the
 * destructive limiter is charged as before. Not strict, because only these fields
 * are read and the body is never written anywhere.
 */
export const destructiveReauthBodySchema = z.object({
  currentPassword: z.string().max(1024).optional(),
  confirmationPhrase: z.string().max(64).optional(),
})

/** `module_slug` is the module picker value: a module slug, or 'all'. */
export const resetProgressBodySchema = destructiveReauthBodySchema.extend({
  module_slug: z.string().max(100).optional(),
})

// ─── POST /api/settings/security, /api/settings/security/change-email ─────────

/**
 * Checked after the routes' own JSON parse, which keeps their 415 and 400 copy. A
 * wrong-typed field used to reach `.trim()` and surface as a 500.
 */
export const changeEmailBodySchema = z.object({
  currentPassword: z.string().max(1024).optional(),
  newEmail: z.string().max(320).optional(),
})

export const changePasswordBodySchema = z.object({
  currentPassword: z.string().max(1024).optional(),
  newPassword: z.string().max(1024).optional(),
  confirmPassword: z.string().max(1024).optional(),
  password: z.string().max(1024).optional(),
})
