import React from 'react'
import { Briefcase } from 'lucide-react'
import { createServerSupabaseClient } from '@/lib/supabase'
import { AdminPageHeader } from '@/components/admin/AdminPageHeader'
import { AdminDataTable, Column } from '@/components/admin/AdminDataTable'
import { AdminStatusBadge } from '@/components/admin/AdminStatusBadge'

export const revalidate = 0

interface PortfolioUser {
  id: string
  email: string
  full_name?: string
  username?: string
  updated_at?: string
}

export default async function AdminPortfoliosPage() {
  const supabase = createServerSupabaseClient()
  const { data: users } = await supabase
    .from('users')
    .select('id, email, full_name, is_portfolio_public, username, updated_at')
    .eq('is_portfolio_public', true)
    .limit(30)

  const portfolioUsers = (users || []) as unknown as PortfolioUser[]

  const columns: Column<PortfolioUser>[] = [
    {
      header: 'Learner',
      cell: (u) => <span className="font-bold text-white">{u.full_name || u.email}</span>,
    },
    {
      header: 'Username Handle',
      cell: (u) => <span className="font-mono text-amber-400">@{u.username || u.id.slice(0, 8)}</span>,
    },
    {
      header: 'Visibility',
      cell: () => <AdminStatusBadge status="published" label="Public" />,
    },
    {
      header: 'Portfolio Link',
      headerClassName: 'text-right',
      className: 'text-right font-mono text-xs text-blue-400',
      cell: (u) => `/p/${u.username || u.id.slice(0, 8)}`,
    },
  ]

  return (
    <div className="space-y-8">
      <AdminPageHeader
        title="Public Portfolios Audit"
        description="Monitor published learner portfolios (`/p/[username]`) and public showcase settings."
        icon={Briefcase}
        iconColor="text-amber-400"
      />

      <AdminDataTable
        columns={columns}
        data={portfolioUsers}
        keyExtractor={(u) => u.id}
        emptyTitle="No public portfolios published yet"
        emptyDescription="Learners can enable public portfolio links from their account settings."
      />
    </div>
  )
}
