import React from 'react'
import { BookOpen, CheckCircle, Flag, Sliders } from 'lucide-react'
import { AdminConsoleService } from '@/lib/admin/service'
import { AdminPageHeader } from '@/components/admin/AdminPageHeader'
import { AdminKpiCard } from '@/components/admin/AdminKpiCard'
import { AdminDataTable, Column } from '@/components/admin/AdminDataTable'
import { AdminStatusBadge } from '@/components/admin/AdminStatusBadge'
import { FeatureFlagToggle } from '@/components/admin/FeatureFlagToggle'

export const revalidate = 0

interface FeatureFlagRow {
  key: string
  enabled: boolean
  updatedAt: string
}

export default async function AdminContentPage() {
  const content = await AdminConsoleService.getContentOverview()
  const flags = AdminConsoleService.getFeatureFlags()

  const flagColumns: Column<FeatureFlagRow>[] = [
    {
      header: 'Feature Flag Key',
      cell: (flag) => <span className="font-mono font-bold text-admin-accent">{flag.key}</span>,
    },
    {
      header: 'Current State',
      cell: (flag) => (
        <AdminStatusBadge
          status={flag.enabled ? 'healthy' : 'archived'}
          label={flag.enabled ? 'Enabled' : 'Disabled'}
        />
      ),
    },
    {
      header: 'Last Updated',
      cell: (flag) => (
        <span className="text-admin-fg-muted font-mono text-[11px]">
          {new Date(flag.updatedAt).toLocaleString()}
        </span>
      ),
    },
    {
      header: 'Action',
      headerClassName: 'text-right',
      className: 'text-right',
      cell: (flag) => (
        <FeatureFlagToggle flagKey={flag.key} initialEnabled={flag.enabled} />
      ),
    },
  ]

  return (
    <div className="space-y-8">
      <AdminPageHeader
        title="Content Management & Marketing Controls"
        description="Curriculum infrastructure metrics, feature flags, and site copy / marketing controls."
        icon={BookOpen}
      />

      {/* Curriculum Overview KPI grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <AdminKpiCard title="Curriculum Modules" value={content.totalModules} subtitle="Core learning tracks" icon={BookOpen} />
        <AdminKpiCard title="Compiled Lessons" value={content.totalLessons} subtitle="Static pre-generated JSON" icon={CheckCircle} iconColor="text-admin-success" />
        <AdminKpiCard title="Quizzes & SRS" value={`${content.totalQuizzes} / ${content.totalFlashcards}`} subtitle="Quizzes / SRS Cards" icon={BookOpen} iconColor="text-admin-info" />
        <AdminKpiCard title="Capstones" value={content.totalCapstones} subtitle="Module deliverables" icon={CheckCircle} iconColor="text-admin-info" />
      </div>

      {/* Curriculum Status Breakdown */}
      <div className="p-6 rounded-xl bg-admin-surface border border-admin-border space-y-4 shadow-xl">
        <h2 className="text-sm font-bold text-admin-fg uppercase tracking-wider">Curriculum Status Breakdown</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
          <div className="p-4 rounded-lg bg-admin-bg/60 border border-admin-border flex items-center justify-between">
            <span className="text-admin-fg-muted font-medium">Published Lessons</span>
            <span className="text-admin-success font-bold font-mono">{content.publishedLessons}</span>
          </div>
          <div className="p-4 rounded-lg bg-admin-bg/60 border border-admin-border flex items-center justify-between">
            <span className="text-admin-fg-muted font-medium">Draft Lessons</span>
            <span className="text-admin-fg-subtle font-bold font-mono">{content.draftLessons}</span>
          </div>
          <div className="p-4 rounded-lg bg-admin-bg/60 border border-admin-border flex items-center justify-between">
            <span className="text-admin-fg-muted font-medium">Archived Lessons</span>
            <span className="text-admin-fg-subtle font-bold font-mono">{content.archivedLessons}</span>
          </div>
        </div>
      </div>

      {/* Feature Flags Controls Section */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Flag className="w-4 h-4 text-admin-accent" />
          <h2 className="text-base font-bold text-admin-fg">Runtime Feature Flags</h2>
        </div>
        <AdminDataTable
          columns={flagColumns}
          data={flags}
          keyExtractor={(f) => f.key}
          emptyTitle="No feature flags configured"
        />
      </div>

      {/* Marketing Controls Section */}
      <div className="p-6 rounded-xl bg-admin-surface border border-admin-border space-y-4 shadow-xl">
        <div className="flex items-center gap-2 border-b border-admin-border pb-3">
          <Sliders className="w-4 h-4 text-admin-info" />
          <h2 className="text-sm font-bold text-admin-fg uppercase tracking-wider">Marketing Site Controls</h2>
        </div>
        <div className="space-y-3 text-xs">
          <div className="p-4 rounded-lg bg-admin-bg/60 border border-admin-border flex items-center justify-between">
            <div>
              <p className="font-bold text-admin-fg">Public Testimonials Section</p>
              <p className="text-admin-fg-muted">Controls whether moderated student testimonials are rendered on Marketing Site v2.</p>
            </div>
            <AdminStatusBadge status="healthy" label="Active" />
          </div>
          <div className="p-4 rounded-lg bg-admin-bg/60 border border-admin-border flex items-center justify-between">
            <div>
              <p className="font-bold text-admin-fg">Curriculum Preview Banner</p>
              <p className="text-admin-fg-muted">Controls 90-lesson interactive timeline preview on landing page.</p>
            </div>
            <AdminStatusBadge status="healthy" label="Active" />
          </div>
        </div>
      </div>
    </div>
  )
}
