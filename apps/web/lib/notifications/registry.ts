import { globalNotificationDispatcher } from './dispatcher'
import { globalProviderRegistry } from './providers'
import { globalFeatureFlagService } from './feature-flags/service'
import { globalTemplateRegistry } from './templates/registry'
import { globalPriorityMatrix } from './priority/matrix'
import { globalAdminFoundationService } from './admin/service'

export class NotificationPlatformRegistry {
  public readonly dispatcher = globalNotificationDispatcher
  public readonly providers = globalProviderRegistry
  public readonly featureFlags = globalFeatureFlagService
  public readonly templates = globalTemplateRegistry
  public readonly priorityMatrix = globalPriorityMatrix
  public readonly admin = globalAdminFoundationService
}

export const notificationPlatform = new NotificationPlatformRegistry()
