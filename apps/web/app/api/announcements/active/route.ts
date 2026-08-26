import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { AnnouncementsService } from '@/lib/admin/announcements-service'
import { createAuthenticatedServerClient, createServiceRoleClient } from '@/lib/supabase'

export async function GET(request: Request) {
  try {
    const url = new URL(request.url)
    let cohortId = url.searchParams.get('cohortId') || undefined
    let userId = url.searchParams.get('userId') || undefined

    // If userId was not explicitly passed, attempt to resolve from authenticated session cookie
    if (!userId) {
      const cookieStore = await cookies()
      const token = cookieStore.get('sb-access-token')?.value
      if (token) {
        try {
          const authSupabase = createAuthenticatedServerClient(token)
          const { data: { user } } = await authSupabase.auth.getUser()
          if (user) {
            userId = user.id
            if (!cohortId) {
              const serviceSupabase = createServiceRoleClient()
              const { data: profile } = await serviceSupabase
                .from('users')
                .select('cohort_id')
                .eq('id', user.id)
                .maybeSingle()
              cohortId = (profile as { cohort_id?: string | null })?.cohort_id || undefined
            }
          }
        } catch {
          // Token invalid or expired — treat as unauthenticated
        }
      }
    }

    // Only authenticated learners are eligible for learner announcements
    if (!userId) {
      return NextResponse.json({ success: true, announcements: [] })
    }

    const announcements = await AnnouncementsService.getActiveAnnouncementsForUser(userId, cohortId)
    return NextResponse.json({ success: true, announcements })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to fetch active announcements'
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
