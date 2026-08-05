import React from 'react'
import { BookOpen, CheckCircle } from 'lucide-react'
import { AdminConsoleService } from '@/lib/admin/service'
import { AdminPageHeader } from '@/components/admin/AdminPageHeader'
import { AdminKpiCard } from '@/components/admin/AdminKpiCard'

export const revalidate = 0

export default async function AdminContentPage() {
  const content = await AdminConsoleService.getContentOverview()

  return (
    <div className="space-y-8">
      <AdminPageHeader
        title="Academy Content Infrastructure"
        description="Monitor status, quizzes, SRS flashcards, and capstone deliverables across 9 modules."
        icon={BookOpen}
        iconColor="text-emerald-400"
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <AdminKpiCard title="Curriculum Modules" value={content.totalModules} subtitle="Core learning tracks" icon={BookOpen} iconColor="text-amber-400" />
        <AdminKpiCard title="Compiled Lessons" value={content.totalLessons} subtitle="Static pre-generated JSON" icon={CheckCircle} iconColor="text-emerald-400" />
        <AdminKpiCard title="Quizzes & SRS" value={`${content.totalQuizzes} / ${content.totalFlashcards}`} subtitle="Quizzes / SRS Cards" icon={BookOpen} iconColor="text-purple-400" />
        <AdminKpiCard title="Capstones" value={content.totalCapstones} subtitle="Module deliverables" icon={CheckCircle} iconColor="text-blue-400" />
      </div>

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
    </div>
  )
}
