import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { AnnouncementsService } from '@/lib/admin/announcements-service'
import { createAuthenticatedServerClient } from '@/lib/supabase'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json().catch(() => ({}))
    let userId = body.userId

    if (!userId) {
      const cookieStore = await cookies()
      const token = cookieStore.get('sb-access-token')?.value
      if (token) {
        try {
          const authSupabase = createAuthenticatedServerClient(token)
          const { data: { user } } = await authSupabase.auth.getUser()
          if (user) {
            userId = user.id
          }
        } catch {
          // Token invalid or expired
        }
      }
    }

    if (!userId) {
      return NextResponse.json({ success: true, message: 'Client-only dismissal noted' })
    }

    await AnnouncementsService.dismissAnnouncement(id, userId)
    return NextResponse.json({ success: true, message: 'Announcement dismissed' })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to dismiss announcement'
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
