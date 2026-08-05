import { createServerSupabaseClient } from '../supabase'
import type { AdminDashboardSummary, AdminSystemHealth, AdminUserOverview } from './types'

export class AdminConsoleService {
  public static async getSystemHealth(): Promise<AdminSystemHealth> {
    const supabase = createServerSupabaseClient()
    const startTime = Date.now()
    const { error } = await supabase.from('users').select('id').limit(1)
    const latency = Date.now() - startTime

    return {
      status: error ? 'degraded' : 'healthy',
      databaseLatencyMs: latency,
      activeCronJobsCount: 5,
      queuePendingItemsCount: 0,
      failedNotifications24h: 0,
      lastCheckedAt: new Date().toISOString(),
    }
  }

  public static async getDashboardSummary(): Promise<AdminDashboardSummary> {
    const supabase = createServerSupabaseClient()
    const [usersRes, lessonsRes, capstonesRes, certsRes, systemHealth] = await Promise.all([
      supabase.from('users').select('id', { count: 'exact', head: true }),
      supabase.from('user_lesson_progress').select('user_id', { count: 'exact', head: true }).eq('completed', true),
      supabase.from('capstone_submissions').select('id', { count: 'exact', head: true }),
      supabase.from('user_certificates').select('id', { count: 'exact', head: true }),
      this.getSystemHealth(),
    ])

    return {
      totalUsers: usersRes.count || 0,
      activeLearners7d: usersRes.count || 0,
      totalLessonsCompleted: lessonsRes.count || 0,
      totalCapstonesSubmitted: capstonesRes.count || 0,
      totalCertificatesIssued: certsRes.count || 0,
      notificationsSent24h: 0,
      systemHealth,
    }
  }

  public static async getUsersOverview(limit = 20): Promise<AdminUserOverview[]> {
    const supabase = createServerSupabaseClient()
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit)

    if (error || !data) return []

    const userRows = data as unknown as Array<{
      id: string
      email: string
      full_name?: string
      is_admin?: boolean
      total_xp?: number
      level?: number
      current_streak?: number
      created_at: string
      updated_at?: string
    }>

    return userRows.map((u) => ({
      id: u.id,
      email: u.email,
      fullName: u.full_name || u.email.split('@')[0],
      role: u.is_admin ? 'Admin' : 'Learner',
      isAdmin: Boolean(u.is_admin),
      totalXp: u.total_xp || 0,
      level: u.level || 1,
      streakDays: u.current_streak || 0,
      createdAt: u.created_at,
      lastActiveAt: u.updated_at || null,
    }))
  }
}
