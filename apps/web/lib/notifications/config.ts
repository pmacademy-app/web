import { BRAND } from '@/lib/brand'

/**
 * Notification Platform Runtime Configuration
 */

export interface NotificationPlatformConfig {
  env: 'development' | 'production' | 'test'
  defaultTimezone: string
  resendApiKey?: string
  cronSecret?: string
  appUrl: string
  isSimulationMode: boolean
}

export function getNotificationConfig(): NotificationPlatformConfig {
  const resendApiKey = process.env.RESEND_API_KEY
  
  return {
    env: (process.env.NODE_ENV as 'development' | 'production' | 'test') || 'development',
    defaultTimezone: 'UTC',
    resendApiKey,
    cronSecret: process.env.CRON_SECRET,
    appUrl: process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') || BRAND.siteUrl,
    isSimulationMode: !resendApiKey,
  }
}
