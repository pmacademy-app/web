export interface CategoryChannelPreference {
  email: boolean
  inApp: boolean
}

export interface UserNotificationPreferences {
  userId: string
  allNotifications: boolean
  allEmail: boolean
  allInApp: boolean
  
  security: CategoryChannelPreference
  learning: CategoryChannelPreference
  achievements: CategoryChannelPreference
  portfolio: CategoryChannelPreference
  certificates: CategoryChannelPreference
  productUpdates: CategoryChannelPreference
  marketing: CategoryChannelPreference

  preferredReminderHour: number
  preferredRecapDay?: number // 0 = Sunday, 1 = Monday, ..., 6 = Saturday (Default: 0 - Sunday)
  preferredRecapHour?: number // 0-23 local hour (Default: 18 - 6 PM)
  timezone: string
  unsubscribeToken?: string
  updatedAt: string
}
