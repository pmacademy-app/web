import { redirect } from 'next/navigation'

export default function PortfoliosAdminRedirect() {
  redirect('/admin/moderation?tab=portfolios')
}

