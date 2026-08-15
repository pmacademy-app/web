import { redirect } from 'next/navigation'

export const revalidate = 0

/**
 * Legacy certificates page — superseded by the Certificates workspace under
 * Achievements (Phase 5). Preserves old bookmarks by redirecting.
 */
export default async function AdminCertificatesRedirectPage() {
  redirect('/admin/achievements/certificates')
}