import React from 'react'
import { FeedbackAdminService } from '@/lib/admin/feedback-service'
import { redirect } from 'next/navigation'
import {
  ModerationService,
  moderationLastPagePath,
  normalizeModerationSearchParams,
  type ModerationUrlParams,
} from '@/lib/admin/moderation-service'
import { FellowRequestAdminService } from '@/lib/admin/fellow-request-service'
import { ModerationWorkspace, type ModerationListData } from '@/components/admin/ModerationWorkspace'

export const revalidate = 0

interface AdminModerationPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

// Kept here rather than imported from the client workspace: a server component that
// imports a value from a 'use client' module gets a client reference, not the array.
const MODERATION_TABS = ['testimonials', 'feedback', 'capstones', 'portfolios', 'fellow-requests'] as const
type Tab = (typeof MODERATION_TABS)[number]

/**
 * Loads only the active tab's page (admin R6 B7, decision 5). Every list is driven by
 * the URL: `status` and `q` are passed through as-is because each service applies its
 * own default, and `page` is 1-based and clamped by the service.
 */
async function loadTab(tab: Tab, params: ModerationUrlParams): Promise<ModerationListData> {
  const paging = { status: params.status ?? null, page: params.page ?? null }

  switch (tab) {
    case 'testimonials':
      return { tab, list: await FeedbackAdminService.getModerationQueuePage(paging) }
    case 'feedback':
      return { tab, list: await FeedbackAdminService.getPrivateFeedbackPage(paging) }
    case 'capstones': {
      const [list, detail] = await Promise.all([
        ModerationService.getCapstonesPage(paging),
        params.capstone
          ? ModerationService.getCapstoneById(params.capstone)
          : Promise.resolve({ capstone: null, failed: false }),
      ])
      return { tab, list, capstone: detail.capstone, capstoneFailed: detail.failed }
    }
    case 'portfolios':
      return { tab, list: await ModerationService.getPortfoliosPage({ ...paging, q: params.q ?? null }) }
    case 'fellow-requests':
      return { tab, list: await FellowRequestAdminService.getQueuePage(paging) }
  }
}

export default async function AdminModerationPage({ searchParams }: AdminModerationPageProps) {
  const params = normalizeModerationSearchParams(await searchParams)
  const tab: Tab = (MODERATION_TABS as readonly string[]).includes(params.tab ?? '')
    ? (params.tab as Tab)
    : 'testimonials'

  const data = await loadTab(tab, params)

  // A page past the end (its last row was just reviewed, or a typed `?page=99`) would
  // render an empty list with no pager: go to the last page that has rows instead.
  const lastPagePath = moderationLastPagePath(tab, params, data.list)
  if (lastPagePath) redirect(lastPagePath)

  return (
    <ModerationWorkspace
      data={data}
      status={params.status ?? null}
      q={params.q ?? ''}
      selectedCapstoneId={params.capstone || null}
    />
  )
}
