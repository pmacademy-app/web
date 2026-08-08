import { redirect } from 'next/navigation'

export default function LegacyEmailsPage() {
  redirect('/admin/communications?tab=queue')
}
