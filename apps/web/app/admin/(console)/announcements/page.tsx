import { redirect } from 'next/navigation'

export default function AdminAnnouncementsRedirect() {
  redirect('/admin/communications?tab=announcements')
}
