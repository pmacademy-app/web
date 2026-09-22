import { NextResponse } from 'next/server'
import { requireUserId } from '@/lib/api/actor'
import { RouteError, withRoute } from '@/lib/api/with-route'
import { createServiceRoleClient } from '@/lib/supabase'
import { globalFeatureFlagService } from '@/lib/notifications/feature-flags/service'
import { PRIORITY_MATRIX } from '@/lib/notifications/constants'
import type { NotificationPriorityLevel } from '@/lib/notifications/types'
import { clampPagination, paginated, toRange, DEFAULT_PAGE_SIZE } from '@/lib/api/pagination'

interface DBChain {
  [method: string]: (...args: unknown[]) => DBChain & Promise<{ data: unknown; error: unknown }>
}

interface InAppNotificationRow {
  id: string
  user_id: string
  category: string
  title: string
  body: string
  action_url?: string | null
  priority: number
  is_read: boolean
  created_at: string
}

export const GET = withRoute(
  {
    actor: { allow: ['learner'] },
    operation: 'notifications.read',
    summary: 'Unexpected failure fetching in-app notifications',
    errorMessage: 'Failed to fetch notifications',
  },
  async ({ request, actor }) => {
  const userId = requireUserId(actor)

  // Feature flag check
  const inAppEnabled = await globalFeatureFlagService.isEnabledAsync('IN_APP_NOTIFICATIONS_ENABLED')
  if (!inAppEnabled) {
    return NextResponse.json({
      success: true,
      ...paginated([], { limit: DEFAULT_PAGE_SIZE, offset: 0 }, 0),
      unreadCount: 0,
      grouped: { today: [], yesterday: [], thisWeek: [], earlier: [] },
      message: 'In-App notifications are currently disabled via Feature Flags',
    })
  }

  const { searchParams } = new URL(request.url)
  const category = searchParams.get('category')
  const unreadOnly = searchParams.get('unreadOnly') === 'true'
  // B13-B: the shared contract. `page` is still accepted so an already-deployed client
  // does not break mid-rollout — it is translated to an offset, and `offset` wins when
  // both are given. The cap now comes from MAX_PAGE_SIZE rather than a local literal.
  const legacyPage = Number(searchParams.get('page'))
  const legacyOffsetFromPage =
    Number.isFinite(legacyPage) && legacyPage > 1 ? (legacyPage - 1) * DEFAULT_PAGE_SIZE : null

  const page = clampPagination({
    limit: searchParams.get('limit'),
    offset: searchParams.get('offset') ?? legacyOffsetFromPage,
  })

  const supabase = createServiceRoleClient()

    let query = supabase
      .from('in_app_notifications')
      .select('id, user_id, category, title, body, action_url, priority, is_read, created_at', { count: 'exact' })
      .eq('user_id', userId)
      .order('created_at', { ascending: false })

    if (category && category !== 'all') {
      query = query.eq('category', category)
    }

    if (unreadOnly) {
      query = query.eq('is_read', false)
    }

    const { from, to } = toRange(page)
    query = query.range(from, to)

    // Execute item query and unread count query concurrently in parallel
    const [itemsResult, unreadResult] = await Promise.all([
      query,
      supabase
        .from('in_app_notifications')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('is_read', false),
    ])

    const { data: items, count, error } = itemsResult
    const unreadCount = unreadResult.count

    if (error) {
      console.warn('[API:notifications] Error fetching notification items from Supabase:', error)
    }

    const rawItems = (items || []) as unknown as InAppNotificationRow[]
    const formattedItems = rawItems.map((item) => ({
      id: item.id,
      userId: item.user_id,
      title: item.title || 'Notification',
      body: item.body || '',
      category: item.category || 'system',
      priority: priorityLevelFromNumber(item.priority),
      isRead: Boolean(item.is_read),
      deepLink: item.action_url || getDeepLinkForCategory(item.category),
      icon: item.category ? getIconForCategory(item.category) : 'bell',
      createdAt: item.created_at,
    }))

    const grouped = groupNotificationsByDate(formattedItems)

    return NextResponse.json({
      success: true,
      ...paginated(formattedItems, page, count),
      unreadCount: unreadCount || formattedItems.filter((i) => !i.isRead).length,
      grouped,
    })
  }
)

export const PATCH = withRoute(
  {
    actor: { allow: ['learner'] },
    operation: 'notifications.mark_read',
    summary: 'Unexpected failure updating notification read state',
    errorMessage: 'Failed to update notification',
  },
  async ({ request, actor }) => {
    const userId = requireUserId(actor)
    const body = (await request.json().catch(() => ({}))) as {
      action?: unknown
      notificationId?: unknown
      notificationIds?: unknown
    }
    const { action, notificationId, notificationIds } = body
    const supabase = createServiceRoleClient()

    if (action === 'mark_all_read') {
      const { error } = await (supabase
        .from('in_app_notifications') as unknown as DBChain)
        .update({ is_read: true, read_at: new Date().toISOString() })
        .eq('user_id', userId)
        .eq('is_read', false)

      if (error) {
        console.error('[API:notifications] Error marking all read:', error)
      }

      return NextResponse.json({ success: true, message: 'All notifications marked as read' })
    }

    // Batch mark-read for displayed notifications in the drawer
    if (Array.isArray(notificationIds) && notificationIds.length > 0) {
      const idsToMark = notificationIds.filter((id: unknown): id is string => typeof id === 'string' && id.length > 0)
      if (idsToMark.length > 0) {
        const { error } = await (supabase
          .from('in_app_notifications') as unknown as DBChain)
          .update({ is_read: true, read_at: new Date().toISOString() })
          .in('id', idsToMark)
          .eq('user_id', userId)
          .eq('is_read', false)

        if (error) {
          console.error('[API:notifications] Error marking batch read:', error)
        }

        return NextResponse.json({ success: true, markedIds: idsToMark, count: idsToMark.length })
      }
    }

    if (!notificationId) {
      throw new RouteError(400, 'VALIDATION', 'Missing notificationId or notificationIds')
    }

    const isRead = action === 'mark_read'
    const readAt = isRead ? new Date().toISOString() : null

    const { error } = await (supabase
      .from('in_app_notifications') as unknown as DBChain)
      .update({ is_read: isRead, read_at: readAt })
      .eq('id', notificationId)
      .eq('user_id', userId)

    if (error) {
      console.error('[API:notifications] Error updating read state:', error)
    }

    return NextResponse.json({ success: true, notificationId, isRead })
  }
)

function getDeepLinkForCategory(category?: string): string {
  switch (category) {
    case 'achievements':
      return '/badges'
    case 'learning':
      return '/academy'
    case 'certificates':
      return '/progress'
    case 'security':
      return '/account'
    default:
      return '/dashboard'
  }
}

function getIconForCategory(category?: string): string {
  switch (category) {
    case 'achievements':
      return 'trophy'
    case 'learning':
      return 'book-open'
    case 'certificates':
      return 'graduation-cap'
    case 'security':
      return 'shield'
    case 'portfolio':
      return 'briefcase'
    case 'capstones':
    case 'capstone':
      return 'folder-check'
    case 'announcement':
    case 'announcements':
      return 'megaphone'
    case 'product_updates':
      return 'sparkles'
    default:
      return 'bell'
  }
}

/**
 * Converts a numeric DB priority back into its level key for the UI.
 */
function priorityLevelFromNumber(priority: number): NotificationPriorityLevel {
  const match = Object.entries(PRIORITY_MATRIX).find(([, def]) => def.numericValue === priority)
  return (match?.[0] as NotificationPriorityLevel) || 'medium'
}

interface NotificationFormattedItem {
  id: string
  userId: string
  title: string
  body: string
  category: string
  priority: string
  isRead: boolean
  deepLink: string
  icon: string
  createdAt: string
}

function groupNotificationsByDate(items: NotificationFormattedItem[]) {
  const now = new Date()
  const todayStr = now.toISOString().split('T')[0]

  const yesterday = new Date(now)
  yesterday.setDate(yesterday.getDate() - 1)
  const yesterdayStr = yesterday.toISOString().split('T')[0]

  const sevenDaysAgo = new Date(now)
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)

  const grouped = {
    today: [] as NotificationFormattedItem[],
    yesterday: [] as NotificationFormattedItem[],
    thisWeek: [] as NotificationFormattedItem[],
    earlier: [] as NotificationFormattedItem[],
  }

  for (const item of items) {
    const itemDate = new Date(item.createdAt)
    const itemDateStr = itemDate.toISOString().split('T')[0]

    if (itemDateStr === todayStr) {
      grouped.today.push(item)
    } else if (itemDateStr === yesterdayStr) {
      grouped.yesterday.push(item)
    } else if (itemDate >= sevenDaysAgo) {
      grouped.thisWeek.push(item)
    } else {
      grouped.earlier.push(item)
    }
  }

  return grouped
}
