/**
 * Client-safe schemas and contract types for settings endpoints (B10-C).
 *
 * Extracted so that both client components and server route handlers can share
 * schemas and types without leaking server data-layer code (e.g. Supabase
 * service-role client, notifications queue, DB models) into the browser bundle.
 */
import { z } from 'zod'
import { validateWritableUrl } from '@/lib/portfolio'

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
  bio: z.string().max(500, 'Bio must be 500 characters or fewer.').optional().nullable(),
  linkedin_url: urlField('LinkedIn URL'),
  github_url: urlField('GitHub URL'),
  website_url: urlField('Website URL'),
})

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

export interface NotificationPreferencesResponse {
  success: boolean
  preferences: NotificationPreferencesData
}
