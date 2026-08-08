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
      cell: (flag) => <span className="font-mono font-bold text-amber-400">{flag.key}</span>,
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
        <span className="text-slate-400 font-mono text-[11px]">
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
        iconColor="text-emerald-400"
      />

      {/* Curriculum Overview KPI grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <AdminKpiCard title="Curriculum Modules" value={content.totalModules} subtitle="Core learning tracks" icon={BookOpen} iconColor="text-amber-400" />
        <AdminKpiCard title="Compiled Lessons" value={content.totalLessons} subtitle="Static pre-generated JSON" icon={CheckCircle} iconColor="text-emerald-400" />
        <AdminKpiCard title="Quizzes & SRS" value={`${content.totalQuizzes} / ${content.totalFlashcards}`} subtitle="Quizzes / SRS Cards" icon={BookOpen} iconColor="text-purple-400" />
        <AdminKpiCard title="Capstones" value={content.totalCapstones} subtitle="Module deliverables" icon={CheckCircle} iconColor="text-blue-400" />
      </div>

      {/* Curriculum Status Breakdown */}
      <div className="p-6 rounded-xl bg-slate-900/60 border border-slate-800 space-y-4 shadow-xl">
        <h2 className="text-sm font-bold text-white uppercase tracking-wider">Curriculum Status Breakdown</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
          <div className="p-4 rounded-lg bg-slate-950/60 border border-slate-800 flex items-center justify-between">
            <span className="text-slate-300 font-medium">Published Lessons</span>
            <span className="text-emerald-400 font-bold font-mono">{content.publishedLessons}</span>
          </div>
          <div className="p-4 rounded-lg bg-slate-950/60 border border-slate-800 flex items-center justify-between">
            <span className="text-slate-300 font-medium">Draft Lessons</span>
            <span className="text-slate-500 font-bold font-mono">{content.draftLessons}</span>
          </div>
          <div className="p-4 rounded-lg bg-slate-950/60 border border-slate-800 flex items-center justify-between">
            <span className="text-slate-300 font-medium">Archived Lessons</span>
            <span className="text-slate-500 font-bold font-mono">{content.archivedLessons}</span>
          </div>
        </div>
      </div>

      {/* Feature Flags Controls Section */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Flag className="w-4 h-4 text-amber-400" />
          <h2 className="text-base font-bold text-white">Runtime Feature Flags</h2>
        </div>
        <AdminDataTable
          columns={flagColumns}
          data={flags}
          keyExtractor={(f) => f.key}
          emptyTitle="No feature flags configured"
        />
      </div>

      {/* Marketing Controls Section */}
      <div className="p-6 rounded-xl bg-slate-900/60 border border-slate-800 space-y-4 shadow-xl">
        <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
          <Sliders className="w-4 h-4 text-blue-400" />
          <h2 className="text-sm font-bold text-white uppercase tracking-wider">Marketing Site Controls</h2>
        </div>
        <div className="space-y-3 text-xs">
          <div className="p-4 rounded-lg bg-slate-950/60 border border-slate-800 flex items-center justify-between">
            <div>
              <p className="font-bold text-white">Public Testimonials Section</p>
              <p className="text-slate-400">Controls whether moderated student testimonials are rendered on Marketing Site v2.</p>
            </div>
            <AdminStatusBadge status="healthy" label="Active" />
          </div>
          <div className="p-4 rounded-lg bg-slate-950/60 border border-slate-800 flex items-center justify-between">
            <div>
              <p className="font-bold text-white">Curriculum Preview Banner</p>
              <p className="text-slate-400">Controls 90-lesson interactive timeline preview on landing page.</p>
            </div>
            <AdminStatusBadge status="healthy" label="Active" />
          </div>
        </div>
      </div>
    </div>
  )
}
