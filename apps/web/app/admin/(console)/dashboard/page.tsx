import { redirect } from 'next/navigation'

/**
 * Admin Dashboard Route Redirect.
 *
 * The canonical Admin Panel Dashboard is located at `/admin` (`app/admin/(console)/page.tsx`).
 * This page redirects requests to `/admin/dashboard` to `/admin` to preserve external bookmarks,
 * navigation references, and ensure all dashboard requests are correctly logged and routed.
 */
export default function AdminDashboardRedirectPage() {
  redirect('/admin')
}
