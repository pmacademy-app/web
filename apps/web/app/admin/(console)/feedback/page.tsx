import { redirect } from 'next/navigation'

export const revalidate = 0

/**
 * Legacy moderation entry point — superseded by the Moderation workspace
 * (Phase 5). Preserves old bookmarks by redirecting to the testimonials tab.
 */
export default async function AdminFeedbackRedirectPage() {
  redirect('/admin/moderation?tab=testimonials')
}