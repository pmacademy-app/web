'use client'

import React from 'react'
import Link from 'next/link'
import { Globe, ExternalLink, User } from 'lucide-react'
import { AdminDataTable, Column } from './AdminDataTable'
import { AdminEmptyState } from './AdminEmptyState'
import { AdminStatusBadge } from './AdminStatusBadge'
import type { AdminPortfolioRow } from '@/lib/admin/achievements-aggregation'

export function PortfoliosView({ initialPortfolios }: { initialPortfolios: AdminPortfolioRow[] }) {
  // Schema note (spec §5.6 "Submitted" column): there is no `portfolios` table —
  // portfolios are derived from `users.is_portfolio_public`, and the only date
  // available is the account join date (`users.created_at`). There is no
  // portfolio submission date, so the column is labeled "Joined" (accurate)
  // rather than "Submitted" (which the schema cannot support).
  const columns: Column<AdminPortfolioRow>[] = [
    {
      header: 'Learner',
      cell: (p) => (
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-admin-surface-raised border border-admin-border flex items-center justify-center font-bold text-admin-accent shrink-0">
            {p.learnerName.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-admin-fg truncate">{p.learnerName}</p>
            <p className="text-[11px] text-admin-fg-muted font-mono truncate">@{p.username || 'no-username'}</p>
          </div>
        </div>
      ),
    },
    {
      header: 'Visibility',
      cell: (p) => (
        <AdminStatusBadge status={p.isPublic ? 'published' : 'archived'} label={p.isPublic ? 'Public' : 'Private'} />
      ),
    },
    {
      header: 'Joined',
      cell: (p) => (
        <span className="text-admin-fg-muted font-mono text-[11px]">
          {p.joinedAt ? new Date(p.joinedAt).toLocaleDateString() : '—'}
        </span>
      ),
    },
    {
      header: 'Portfolio',
      headerClassName: 'text-right',
      className: 'text-right',
      cell: (p) =>
        p.username ? (
          <a
            href={`/p/${encodeURIComponent(p.username)}`}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-admin-success-soft hover:bg-admin-success/20 text-admin-success text-[11px] font-semibold border border-admin-success/25 transition-colors"
          >
            <ExternalLink className="w-3 h-3" /> Open
          </a>
        ) : (
          <span className="text-admin-fg-subtle text-[11px]">No username</span>
        ),
    },
  ]

  return (
    <div className="space-y-4">
      {initialPortfolios.length === 0 ? (
        <AdminEmptyState
          icon={Globe}
          title="No public portfolios found"
          description="Learners with a public portfolio will appear here."
        />
      ) : (
        <AdminDataTable
          columns={columns}
          data={initialPortfolios}
          keyExtractor={(p) => p.userId}
          rowActions={(p) => (
            <Link
              href={`/admin/users?userId=${encodeURIComponent(p.userId)}`}
              onClick={(e) => e.stopPropagation()}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-admin-surface-raised hover:bg-admin-surface-raised/80 text-admin-fg-muted hover:text-admin-fg text-[11px] font-semibold border border-admin-border transition-colors"
            >
              <User className="w-3 h-3" /> Inspect
            </Link>
          )}
          emptyTitle="No public portfolios found"
          emptyDescription="Learners with a public portfolio will appear here."
        />
      )}
    </div>
  )
}