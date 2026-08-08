import { redirect } from 'next/navigation'

export default function LegacyTemplatesPage() {
  redirect('/admin/communications?tab=templates')
}
