import { NextResponse } from 'next/server'
import { FeedbackAdminService } from '@/lib/admin/feedback-service'

export async function GET() {
  try {
    const testimonials = await FeedbackAdminService.getPublishedTestimonials()
    return NextResponse.json({ testimonials })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to fetch testimonials.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
