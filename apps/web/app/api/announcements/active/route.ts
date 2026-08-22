import { NextResponse } from 'next/server'
import { AnnouncementsService } from '@/lib/admin/announcements-service'

export async function GET(request: Request) {
  try {
    const url = new URL(request.url)
    const cohortId = url.searchParams.get('cohortId') || undefined
    const userId = url.searchParams.get('userId') || undefined

    const announcements = await AnnouncementsService.getActiveAnnouncementsForUser(userId, cohortId)
    return NextResponse.json({ success: true, announcements })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to fetch active announcements'
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
