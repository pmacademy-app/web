import React from 'react'
import { BookOpen, CheckCircle, Layers } from 'lucide-react'
import { AdminConsoleService } from '@/lib/admin/service'

export const revalidate = 0

export default async function AdminContentPage() {
  const overview = await AdminConsoleService.getContentOverview()

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
            <BookOpen className="w-6 h-6 text-amber-400" />
            Academy Content Management
          </h1>
          <p className="text-sm text-slate-400">Curriculum statistics, module breakdown, and publishing status.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800">
          <span className="text-xs font-semibold text-slate-400 uppercase">Modules</span>
          <p className="text-2xl font-extrabold text-white mt-1">{overview.totalModules}</p>
        </div>
        <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800">
          <span className="text-xs font-semibold text-slate-400 uppercase">Published Lessons</span>
          <p className="text-2xl font-extrabold text-emerald-400 mt-1">{overview.publishedLessons}</p>
        </div>
        <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800">
          <span className="text-xs font-semibold text-slate-400 uppercase">Interactive Flashcards</span>
          <p className="text-2xl font-extrabold text-purple-400 mt-1">{overview.totalFlashcards}</p>
        </div>
        <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800">
          <span className="text-xs font-semibold text-slate-400 uppercase">Applied Capstones</span>
          <p className="text-2xl font-extrabold text-amber-400 mt-1">{overview.totalCapstones}</p>
        </div>
      </div>

      <div className="p-6 rounded-xl bg-slate-900/60 border border-slate-800 space-y-4">
        <h2 className="text-base font-bold text-white flex items-center gap-2">
          <Layers className="w-5 h-5 text-amber-400" />
          Curriculum Modules Overview
        </h2>
        <div className="space-y-3">
          {[
            { id: 1, title: 'PM Foundations', lessons: 10, status: 'Published' },
            { id: 2, title: 'Product Discovery', lessons: 10, status: 'Published' },
            { id: 3, title: 'PRDs & Execution', lessons: 10, status: 'Published' },
            { id: 4, title: 'Product Analytics & Metrics', lessons: 10, status: 'Published' },
            { id: 5, title: 'UX & Product Design', lessons: 10, status: 'Published' },
            { id: 6, title: 'Technical PM & Architecture', lessons: 10, status: 'Published' },
            { id: 7, title: 'Growth & Monetization', lessons: 10, status: 'Published' },
            { id: 8, title: 'Product Strategy & Roadmapping', lessons: 10, status: 'Published' },
            { id: 9, title: 'Leadership & AI for PMs', lessons: 10, status: 'Published' },
          ].map((mod) => (
            <div key={mod.id} className="p-4 rounded-lg bg-slate-950/60 border border-slate-800/80 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="w-7 h-7 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 font-bold text-xs flex items-center justify-center">
                  M{mod.id}
                </span>
                <div>
                  <h3 className="font-bold text-sm text-white">{mod.title}</h3>
                  <p className="text-xs text-slate-400">{mod.lessons} Compiled Markdown Lessons</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  <CheckCircle className="w-3 h-3" /> {mod.status}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
