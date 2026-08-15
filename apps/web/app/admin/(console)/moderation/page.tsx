import React from 'react'
import { FeedbackAdminService } from '@/lib/admin/feedback-service'
import { ModerationService } from '@/lib/admin/moderation-service'
import { ModerationWorkspace } from '@/components/admin/ModerationWorkspace'

export const revalidate = 0

interface AdminModerationPageProps {
  searchParams: Promise<{
    tab?: string
    capstone?: string
    status?: string
  }>
}

export default async function AdminModerationPage({ searchParams }: AdminModerationPageProps) {
  const params = await searchParams
  const tab = params.tab || 'testimonials'

  const [testimonials, feedback, capstones, portfolios] = await Promise.all([
    FeedbackAdminService.getModerationQueue('all'),
    FeedbackAdminService.getPrivateFeedbackList(),
    ModerationService.getCapstones('all'),
    ModerationService.getPortfolios(),
  ])

  const capstoneDetail = params.capstone
    ? capstones.capstones.find((c) => c.id === params.capstone) || null
    : null

  return (
    <ModerationWorkspace
      initialTab={tab}
      initialTestimonials={testimonials}
      initialFeedback={feedback}
      initialCapstones={capstones.capstones}
      capstonesLoadFailed={capstones.failed}
      initialPortfolios={portfolios.portfolios}
      portfoliosLoadFailed={portfolios.failed}
      initialCapstoneStatus={params.status || 'all'}
      selectedCapstoneId={params.capstone || null}
      selectedCapstoneDetail={capstoneDetail}
    />
  )
}