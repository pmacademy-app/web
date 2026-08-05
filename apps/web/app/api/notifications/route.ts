import { NextResponse } from 'next/server'
import { getAuthenticatedUserFromRequest } from '@/lib/auth'
import { createServerSupabaseClient } from '@/lib/supabase'
import { globalFeatureFlagService } from '@/lib/notifications/feature-flags/service'

interface DBChain {
  [method: string]: (...args: unknown[]) => DBChain & Promise<{ data: unknown; error: unknown }>
}

interface TimelineRow {
  id: string
  user_id: string
  event_type?: string
  title?: string
  body?: string
  message?: string
  category?: string
  priority?: string
  is_read?: boolean
  deep_link?: string
  icon?: string
  metadata?: Record<string, unknown>
  created_at: string
}

export async function GET(request: Request) {
  const authUser = await getAuthenticatedUserFromRequest(request)
  if (!authUser) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Feature flag check
  const inAppEnabled = globalFeatureFlagService.isEnabled('IN_APP_NOTIFICATIONS_ENABLED')
  if (!inAppEnabled) {
    return NextResponse.json({
      success: true,
      items: [],
      total: 0,
      unreadCount: 0,
      grouped: { today: [], yesterday: [], thisWeek: [], earlier: [] },
      message: 'In-App notifications are currently disabled via Feature Flags',
    })
  }

  const { searchParams } = new URL(request.url)
  const category = searchParams.get('category')
  const unreadOnly = searchParams.get('unreadOnly') === 'true'
  const limit = Math.min(50, Math.max(1, parseInt(searchParams.get('limit') || '20', 10)))
  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10))

  const supabase = createServerSupabaseClient()

  try {
    let query = supabase
      .from('user_notification_timeline')
      .select('*', { count: 'exact' })
      .eq('user_id', authUser.id)
      .order('created_at', { ascending: false })

    if (category && category !== 'all') {
      query = query.eq('category', category)
    }

    if (unreadOnly) {
      query = query.eq('is_read', false)
    }

    const fromOffset = (page - 1) * limit
    const toOffset = fromOffset + limit - 1

    query = query.range(fromOffset, toOffset)

    const { data: items, count, error } = await query

    // Query total unread count
    const { count: unreadCount } = await supabase
      .from('user_notification_timeline')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', authUser.id)
      .eq('is_read', false)

    if (error) {
      console.warn('[API:notifications] Error fetching timeline items from Supabase:', error)
    }

    const rawItems = (items || []) as unknown as TimelineRow[]
    const formattedItems = rawItems.map((item) => ({
      id: item.id,
      userId: item.user_id,
      title: item.title || item.event_type || 'Notification',
      body: item.body || item.message || '',
      category: item.category || 'system',
      priority: item.priority || 'medium',
      isRead: Boolean(item.is_read),
      deepLink: item.deep_link || getDeepLinkForEventType(item.event_type, item.metadata),
      icon: item.icon || getIconForCategory(item.category),
      createdAt: item.created_at,
    }))

    const grouped = groupNotificationsByDate(formattedItems)

    return NextResponse.json({
      success: true,
      items: formattedItems,
      total: count || formattedItems.length,
      unreadCount: unreadCount || formattedItems.filter((i) => !i.isRead).length,
      page,
      limit,
      grouped,
    })
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Failed to fetch notifications'
    return NextResponse.json({ success: false, error: errorMsg }, { status: 500 })
  }
}

export async function PATCH(request: Request) {
  const authUser = await getAuthenticatedUserFromRequest(request)
  if (!authUser) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { action, notificationId } = body
    const supabase = createServerSupabaseClient()

    if (action === 'mark_all_read') {
      const { error } = await (supabase
        .from('user_notification_timeline') as unknown as DBChain)
        .update({ is_read: true, read_at: new Date().toISOString() })
        .eq('user_id', authUser.id)
        .eq('is_read', false)

      if (error) {
        console.error('[API:notifications] Error marking all read:', error)
      }

      return NextResponse.json({ success: true, message: 'All notifications marked as read' })
    }

    if (!notificationId) {
      return NextResponse.json({ error: 'Missing notificationId' }, { status: 400 })
    }

    const isRead = action === 'mark_read'
    const readAt = isRead ? new Date().toISOString() : null

    const { error } = await (supabase
      .from('user_notification_timeline') as unknown as DBChain)
      .update({ is_read: isRead, read_at: readAt })
      .eq('id', notificationId)
      .eq('user_id', authUser.id)

    if (error) {
      console.error('[API:notifications] Error updating read state:', error)
    }

    return NextResponse.json({ success: true, notificationId, isRead })
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Failed to update notification'
    return NextResponse.json({ success: false, error: errorMsg }, { status: 500 })
  }
}

function getDeepLinkForEventType(eventType?: string, metadata?: Record<string, unknown>): string {
  switch (eventType) {
    case 'lesson.completed':
    case 'module.completed':
      return '/academy'
    case 'badge.earned':
      return '/badges'
    case 'xp.level_up':
      return '/progress'
    case 'certificate.generated':
      return typeof metadata?.certificateCode === 'string' ? `/verify/${metadata.certificateCode}` : '/progress'
    case 'portfolio.published':
      return typeof metadata?.username === 'string' ? `/p/${metadata.username}` : '/settings'
    case 'srs.review_due':
      return '/review'
    case 'capstone.submitted':
      return '/capstones'
    default:
      return '/dashboard'
  }
}

function getIconForCategory(category?: string): string {
  switch (category) {
    case 'achievements':
      return '🏆'
    case 'learning':
      return '📚'
    case 'certificates':
      return '🎓'
    case 'security':
      return '🔒'
    default:
      return '🔔'
  }
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
