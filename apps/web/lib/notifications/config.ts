import { BRAND } from '@/lib/brand'

/**
 * Notification Platform Runtime Configuration
 */

export interface NotificationPlatformConfig {
  env: 'development' | 'production' | 'test'
  defaultTimezone: string
  brevoApiKey?: string
  resendApiKey?: string
  primaryEmailProvider: string
  cronSecret?: string
  appUrl: string
  isSimulationMode: boolean
}

export type EmailProviderName = 'brevo' | 'resend'

/**
 * Single source of truth for which provider is primary.
 *
 * Previously each stack decided this for itself and they disagreed: `lib/email.ts`
 * preferred Resend whenever a Resend key was present, while the provider registry
 * preferred Brevo. With `PRIMARY_EMAIL_PROVIDER` unset, auth mail and queued mail
 * could therefore leave via different providers — different sender identity, DKIM
 * alignment, and bounce webhooks.
 *
 * Resolution order:
 *  1. `PRIMARY_EMAIL_PROVIDER` when it names a provider we actually support
 *  2. Brevo when `BREVO_API_KEY` is set
 *  3. Resend when `RESEND_API_KEY` is set
 *  4. Brevo (matches `.env.example`, and keeps behavior stable when nothing is set)
 */
export function resolvePrimaryProvider(): EmailProviderName {
  const explicit = process.env.PRIMARY_EMAIL_PROVIDER?.toLowerCase().trim()
  if (explicit === 'brevo' || explicit === 'resend') return explicit
  if (process.env.BREVO_API_KEY) return 'brevo'
  if (process.env.RESEND_API_KEY) return 'resend'
  return 'brevo'
}

/** The other provider — the failover target for a given primary. */
export function getSecondaryProvider(primary: EmailProviderName): EmailProviderName {
  return primary === 'brevo' ? 'resend' : 'brevo'
}

/** Whether a provider has credentials configured in this environment. */
export function isProviderConfigured(name: EmailProviderName): boolean {
  return name === 'brevo' ? Boolean(process.env.BREVO_API_KEY) : Boolean(process.env.RESEND_API_KEY)
}

export function getNotificationConfig(): NotificationPlatformConfig {
  const brevoApiKey = process.env.BREVO_API_KEY
  const resendApiKey = process.env.RESEND_API_KEY
  const primaryEmailProvider = resolvePrimaryProvider()

  return {
    env: (process.env.NODE_ENV as 'development' | 'production' | 'test') || 'development',
    defaultTimezone: 'UTC',
    brevoApiKey,
    resendApiKey,
    primaryEmailProvider,
    cronSecret: process.env.CRON_SECRET,
    appUrl: process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') || BRAND.siteUrl,
    isSimulationMode: !brevoApiKey && !resendApiKey,
  }
}
