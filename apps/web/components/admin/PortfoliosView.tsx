'use client'

import React, { useState, useMemo } from 'react'
import Link from 'next/link'
import {
  Globe,
  ExternalLink,
  User,
  ShieldCheck,
  GraduationCap,
  Clock,
  Search,
  Loader2,
  CheckCircle2,
  FileCheck2,
} from 'lucide-react'
import { AdminDataTable, Column } from './AdminDataTable'
import { AdminEmptyState } from './AdminEmptyState'
import { AdminConfirmDialog } from './AdminConfirmDialog'
import { useAdminToast } from './admin-toast'
import type { AdminPortfolioRow } from '@/lib/admin/achievements-aggregation'

interface PortfoliosViewProps {
  initialPortfolios: AdminPortfolioRow[]
}

type TabFilter = 'pending' | 'verified' | 'all'

export function PortfoliosView({ initialPortfolios }: PortfoliosViewProps) {
  const { toast } = useAdminToast()
  const [portfolios, setPortfolios] = useState<AdminPortfolioRow[]>(initialPortfolios)
  const [activeTab, setActiveTab] = useState<TabFilter>('pending')
  const [searchQuery, setSearchQuery] = useState('')
  const [loadingUserId, setLoadingUserId] = useState<string | null>(null)
  const [unverifyTarget, setUnverifyTarget] = useState<AdminPortfolioRow | null>(null)

  // Compute live KPIs
  const pendingCount = useMemo(() => portfolios.filter((p) => !p.isFellow).length, [portfolios])
  const verifiedCount = useMemo(() => portfolios.filter((p) => p.isFellow).length, [portfolios])
  const totalCount = portfolios.length

  // Filtered dataset
  const filteredPortfolios = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    return portfolios.filter((p) => {
      // Tab filter
      if (activeTab === 'pending' && p.isFellow) return false
      if (activeTab === 'verified' && !p.isFellow) return false

      // Search query
      if (q) {
        const matchesName = p.learnerName.toLowerCase().includes(q)
        const matchesUsername = p.username ? p.username.toLowerCase().includes(q) : false
        const matchesEmail = p.email.toLowerCase().includes(q)
        const matchesBio = p.bio ? p.bio.toLowerCase().includes(q) : false
        return matchesName || matchesUsername || matchesEmail || matchesBio
      }

      return true
    })
  }, [portfolios, activeTab, searchQuery])

  // Execute verification / unverification action
  const handleToggleVerification = async (targetUser: AdminPortfolioRow, nextFellowState: boolean) => {
    setLoadingUserId(targetUser.userId)
    setUnverifyTarget(null)

    try {
      const res = await fetch(`/api/admin/users/${targetUser.userId}/fellow-status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isFellow: nextFellowState }),
      })

      const data = await res.json()

      if (res.ok && data.success) {
        setPortfolios((prev) =>
          prev.map((item) =>
            item.userId === targetUser.userId ? { ...item, isFellow: nextFellowState } : item
          )
        )
        toast(
          nextFellowState
            ? `Verified portfolio for ${targetUser.learnerName} (@${targetUser.username || 'user'}).`
            : `Revoked verification for ${targetUser.learnerName}.`,
          'success'
        )
      } else {
        toast(data.error || 'Failed to update portfolio verification status.', 'error')
      }
    } catch {
      toast('Network error updating portfolio verification status.', 'error')
    } finally {
      setLoadingUserId(null)
    }
  }

  const columns: Column<AdminPortfolioRow>[] = [
    {
      header: 'Learner & Identity',
      cell: (p) => (
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-admin-surface-raised border border-admin-border flex items-center justify-center font-bold text-admin-accent shrink-0 text-sm">
            {p.learnerName.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-admin-fg truncate text-xs">{p.learnerName}</span>
              {p.isFellow && (
                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/25">
                  <GraduationCap className="w-3 h-3" /> Fellow
                </span>
              )}
            </div>
            <div className="flex items-center gap-1.5 text-[11px] text-admin-fg-muted font-mono">
              <span>@{p.username || 'no-username'}</span>
              <span>•</span>
              <span className="truncate max-w-[140px]">{p.email}</span>
            </div>
          </div>
        </div>
      ),
    },
    {
      header: 'Headline / Bio',
      cell: (p) => (
        <div className="max-w-xs text-[11px] text-admin-fg-muted line-clamp-2 leading-relaxed">
          {p.bio || <span className="italic text-admin-fg-subtle">No bio provided</span>}
        </div>
      ),
    },
    {
      header: 'Applied Projects',
      cell: (p) => (
        <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-admin-surface-raised border border-admin-border text-[11px] font-medium text-admin-fg">
          <FileCheck2 className="w-3 h-3 text-admin-accent" />
          <span>{p.capstoneCount} {p.capstoneCount === 1 ? 'Project' : 'Projects'}</span>
        </div>
      ),
    },
    {
      header: 'Verification Status',
      cell: (p) => (
        p.isFellow ? (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/25">
            <CheckCircle2 className="w-3.5 h-3.5" />
            Verified Fellow
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/25">
            <Clock className="w-3.5 h-3.5" />
            Pending Review
          </span>
        )
      ),
    },
    {
      header: 'Portfolio Link',
      cell: (p) =>
        p.username ? (
          <a
            href={`/p/${encodeURIComponent(p.username)}`}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-admin-surface-raised hover:bg-admin-surface-raised/80 text-admin-fg text-[11px] font-medium border border-admin-border hover:border-admin-accent/40 transition-colors"
          >
            <ExternalLink className="w-3 h-3 text-admin-accent" /> Open ↗
          </a>
        ) : (
          <span className="text-admin-fg-subtle text-[11px]">No username</span>
        ),
    },
    {
      header: 'Verification Action',
      headerClassName: 'text-right',
      className: 'text-right',
      cell: (p) => {
        const isLoading = loadingUserId === p.userId

        if (p.isFellow) {
          return (
            <div className="flex items-center justify-end gap-1.5">
              <button
                type="button"
                disabled={isLoading}
                onClick={() => setUnverifyTarget(p)}
                className="px-2.5 py-1 rounded text-[11px] font-semibold bg-admin-surface-raised hover:bg-admin-surface-raised/80 text-admin-fg-muted hover:text-admin-danger border border-admin-border hover:border-admin-danger/30 transition-colors cursor-pointer disabled:opacity-50 inline-flex items-center gap-1"
              >
                {isLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                <span>Unverify</span>
              </button>
            </div>
          )
        }

        return (
          <div className="flex items-center justify-end gap-1.5">
            <button
              type="button"
              disabled={isLoading}
              onClick={() => handleToggleVerification(p, true)}
              className="px-3 py-1 rounded text-[11px] font-semibold bg-admin-accent-soft hover:bg-admin-accent/20 text-admin-accent border border-admin-accent/30 transition-colors cursor-pointer disabled:opacity-50 inline-flex items-center gap-1.5 shadow-xs"
            >
              {isLoading ? (
                <Loader2 className="w-3 h-3 animate-spin text-admin-accent" />
              ) : (
                <ShieldCheck className="w-3.5 h-3.5 text-admin-accent" />
              )}
              <span>Verify</span>
            </button>
          </div>
        )
      },
    },
  ]

  return (
    <div className="space-y-6">
      {/* Top KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Pending Verification */}
        <div
          onClick={() => setActiveTab('pending')}
          className={`p-4 rounded-xl border transition-all cursor-pointer ${
            activeTab === 'pending'
              ? 'bg-amber-500/10 border-amber-500/40 ring-1 ring-amber-500/30'
              : 'bg-admin-surface border-admin-border hover:border-amber-500/30'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-admin-fg-muted uppercase tracking-wider">
              Pending Verification
            </span>
            <div className="p-1.5 rounded-lg bg-amber-500/15 text-amber-500">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-black text-admin-fg mt-2 font-mono">{pendingCount}</p>
          <p className="text-[11px] text-admin-fg-subtle mt-0.5">Public portfolios awaiting review</p>
        </div>

        {/* Verified Portfolios */}
        <div
          onClick={() => setActiveTab('verified')}
          className={`p-4 rounded-xl border transition-all cursor-pointer ${
            activeTab === 'verified'
              ? 'bg-emerald-500/10 border-emerald-500/40 ring-1 ring-emerald-500/30'
              : 'bg-admin-surface border-admin-border hover:border-emerald-500/30'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-admin-fg-muted uppercase tracking-wider">
              Verified Fellows
            </span>
            <div className="p-1.5 rounded-lg bg-emerald-500/15 text-emerald-500">
              <GraduationCap className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-black text-admin-fg mt-2 font-mono">{verifiedCount}</p>
          <p className="text-[11px] text-admin-fg-subtle mt-0.5">Designated PM Fellows</p>
        </div>

        {/* Total Public Portfolios */}
        <div
          onClick={() => setActiveTab('all')}
          className={`p-4 rounded-xl border transition-all cursor-pointer ${
            activeTab === 'all'
              ? 'bg-admin-accent-soft/40 border-admin-accent/40 ring-1 ring-admin-accent/30'
              : 'bg-admin-surface border-admin-border hover:border-admin-accent/30'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-admin-fg-muted uppercase tracking-wider">
              Total Public Portfolios
            </span>
            <div className="p-1.5 rounded-lg bg-admin-accent-soft text-admin-accent">
              <Globe className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-black text-admin-fg mt-2 font-mono">{totalCount}</p>
          <p className="text-[11px] text-admin-fg-subtle mt-0.5">Active public portfolios directory</p>
        </div>
      </div>

      {/* Filter Tabs & Search Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
        {/* Filter Tabs */}
        <div className="flex items-center gap-1 bg-admin-surface p-1 rounded-lg border border-admin-border self-start">
          <button
            type="button"
            onClick={() => setActiveTab('pending')}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all inline-flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'pending'
                ? 'bg-amber-500/15 text-amber-500 border border-amber-500/25 shadow-xs'
                : 'text-admin-fg-muted hover:text-admin-fg'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            <span>Pending Verification</span>
            <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-admin-surface-raised font-mono">
              {pendingCount}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('verified')}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all inline-flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'verified'
                ? 'bg-emerald-500/15 text-emerald-500 border border-emerald-500/25 shadow-xs'
                : 'text-admin-fg-muted hover:text-admin-fg'
            }`}
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>Verified</span>
            <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-admin-surface-raised font-mono">
              {verifiedCount}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('all')}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all inline-flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'all'
                ? 'bg-admin-surface-raised text-admin-fg border border-admin-border shadow-xs'
                : 'text-admin-fg-muted hover:text-admin-fg'
            }`}
          >
            <Globe className="w-3.5 h-3.5" />
            <span>All Public</span>
            <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-admin-surface-raised font-mono">
              {totalCount}
            </span>
          </button>
        </div>

        {/* Live Search Input */}
        <div className="relative w-full sm:w-72">
          <Search className="w-3.5 h-3.5 text-admin-fg-subtle absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search learner, handle, bio..."
            className="w-full pl-9 pr-3 py-1.5 text-xs rounded-lg bg-admin-surface border border-admin-border text-admin-fg placeholder:text-admin-fg-subtle focus:outline-none focus:border-admin-accent/50 transition-colors"
          />
        </div>
      </div>

      {/* Portfolios Table */}
      {filteredPortfolios.length === 0 ? (
        <AdminEmptyState
          icon={activeTab === 'pending' ? CheckCircle2 : Globe}
          title={
            activeTab === 'pending'
              ? 'No pending portfolio verifications'
              : activeTab === 'verified'
              ? 'No verified portfolios found'
              : 'No public portfolios found'
          }
          description={
            activeTab === 'pending'
              ? 'All public portfolios have been reviewed! New public portfolios will appear here for verification.'
              : activeTab === 'verified'
              ? 'No learners are currently verified as PM Fellows.'
              : 'Learners who publish their portfolio will appear here.'
          }
        />
      ) : (
        <AdminDataTable
          columns={columns}
          data={filteredPortfolios}
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
          emptyTitle="No public portfolios match your search"
          emptyDescription="Try clearing your search query or switching filters."
        />
      )}

      {/* Confirm Unverify Dialog */}
      {unverifyTarget && (
        <AdminConfirmDialog
          open={Boolean(unverifyTarget)}
          onOpenChange={(open) => {
            if (!open) setUnverifyTarget(null)
          }}
          title={`Revoke PM Fellow verification for ${unverifyTarget.learnerName}?`}
          description={`Are you sure you want to revoke verification for ${unverifyTarget.learnerName} (@${unverifyTarget.username || 'user'})? Their public portfolio will no longer display the "Product Management Fellow at Prodily" designation.`}
          confirmLabel="Revoke Verification"
          destructive
          onConfirm={() => handleToggleVerification(unverifyTarget, false)}
          onCancel={() => setUnverifyTarget(null)}
        />
      )}
    </div>
  )
}