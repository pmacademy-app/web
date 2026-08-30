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

export function getNotificationConfig(): NotificationPlatformConfig {
  const brevoApiKey = process.env.BREVO_API_KEY
  const resendApiKey = process.env.RESEND_API_KEY
  const primaryEmailProvider = (process.env.PRIMARY_EMAIL_PROVIDER || (brevoApiKey ? 'brevo' : 'resend')).toLowerCase()
  
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
