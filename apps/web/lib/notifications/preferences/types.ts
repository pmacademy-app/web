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
  timezone: string
  unsubscribeToken?: string
  updatedAt: string
}
