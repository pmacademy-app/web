import React from 'react'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { User, Zap, Flame, Award, BookOpen, ArrowLeft } from 'lucide-react'
import { AdminConsoleService } from '@/lib/admin/service'
import { AdminPageHeader } from '@/components/admin/AdminPageHeader'
import { AdminKpiCard } from '@/components/admin/AdminKpiCard'
import { AdminStatusBadge } from '@/components/admin/AdminStatusBadge'
import { UserRoleToggle } from '@/components/admin/UserRoleToggle'
import { DeveloperActionsSection } from '@/components/admin/DeveloperActionsSection'

export const revalidate = 0

export default async function AdminUserDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: userId } = await params
  const user = await AdminConsoleService.getUserDetail(userId)

  if (!user) {
    notFound()
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-2 text-xs text-slate-400">
        <Link href="/admin/users" className="hover:text-amber-400 flex items-center gap-1">
          <ArrowLeft className="w-3.5 h-3.5" /> Back to User Management
        </Link>
      </div>

      <AdminPageHeader
        title={user.fullName}
        description={`Learner profile inspection and account metadata for ${user.email}`}
        icon={User}
        iconColor="text-amber-400"
        actions={
          <UserRoleToggle
            userId={user.id}
            initialIsAdmin={user.isAdmin}
            userEmail={user.email}
          />
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <AdminKpiCard title="Total XP & Level" value={`Lvl ${user.level}`} subtitle={`${user.totalXp.toLocaleString()} Total XP`} icon={Zap} iconColor="text-purple-400" />
        <AdminKpiCard title="Streak Days" value={`${user.streakDays}d`} subtitle="Active daily learning streak" icon={Flame} iconColor="text-amber-400" />
        <AdminKpiCard title="Lessons Completed" value={user.lessonsCompleted} subtitle="Curriculum lessons" icon={BookOpen} iconColor="text-emerald-400" />
        <AdminKpiCard title="Certificates Issued" value={user.certificatesCount} subtitle="Signed module credentials" icon={Award} iconColor="text-blue-400" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="p-6 rounded-xl bg-slate-900/60 border border-slate-800 space-y-4 shadow-xl">
          <h2 className="text-sm font-bold text-white uppercase tracking-wider">Account Overview</h2>
          <div className="space-y-3 text-xs">
            <div className="p-3 rounded bg-slate-950/60 border border-slate-800 flex justify-between">
              <span className="text-slate-400">User ID</span>
              <span className="font-mono text-slate-200">{user.id}</span>
            </div>
            <div className="p-3 rounded bg-slate-950/60 border border-slate-800 flex justify-between">
              <span className="text-slate-400">Account Goal</span>
              <span className="text-slate-200">{user.goal || 'General Skill Upgrade'}</span>
            </div>
            <div className="p-3 rounded bg-slate-950/60 border border-slate-800 flex justify-between">
              <span className="text-slate-400">Public Portfolio</span>
              <AdminStatusBadge status={user.hasPublicPortfolio ? 'published' : 'archived'} label={user.hasPublicPortfolio ? 'Enabled' : 'Disabled'} />
            </div>
            <div className="p-3 rounded bg-slate-950/60 border border-slate-800 flex justify-between">
              <span className="text-slate-400">Joined Date</span>
              <span className="font-mono text-slate-200">{new Date(user.createdAt).toLocaleString()}</span>
            </div>
          </div>
        </div>

        <DeveloperActionsSection targetUserId={user.id} targetUserEmail={user.email} />
      </div>
    </div>
  )
}
