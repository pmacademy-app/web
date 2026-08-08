import React from 'react'
import { FeedbackAdminService } from '@/lib/admin/feedback-service'
import { FeedbackModerationView } from '@/components/admin/FeedbackModerationView'

export const revalidate = 0

export default async function AdminFeedbackPage() {
  const queue = await FeedbackAdminService.getModerationQueue('all')

  return <FeedbackModerationView initialQueue={queue} />
}
