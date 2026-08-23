import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createServiceRoleClient } from '@/lib/supabase'
import { getServerUser } from '@/lib/auth'
import { getUserXpSummary } from '@/lib/xp-service'
import { getUserStreakStatus } from '@/lib/streaks-db'
import { getSkillRadarSummary } from '@/lib/skillRadar'
import { getUserCertificates, issueCertificate } from '@/lib/certificates-db'
import { getUserBadgesData } from '@/lib/badges-db'
import { CAPSTONE_DEFINITIONS } from '@/config/capstones'
import { LevelCard } from '@/components/dashboard/LevelCard'
import { StreakCard } from '@/components/dashboard/StreakCard'
import { ProgressRingCard } from '@/components/dashboard/ProgressRingCard'
import { SkillRadarCard } from '@/components/dashboard/SkillRadarCard'
import { BadgeShowcaseCard } from '@/components/progress/BadgeShowcaseCard'
import { Shield, Award as CertIcon, ExternalLink, ArrowRight } from 'lucide-react'

interface DBChain {
  [method: string]: (...args: unknown[]) => DBChain & Promise<{ data: unknown; error: unknown }>
}

export const metadata: Metadata = {
  title: 'My Progress & Competency Dashboard',
  description: 'Single source of truth for your PM skills, competency radar, lesson progress, capstones, XP rank, and certificates.',
}

export default async function ProgressPage() {
  const user = await getServerUser()
  if (!user) {
    redirect('/login')
  }

  const supabase = createServiceRoleClient()

  // Fetch all performance & competency data in parallel with lean column projection
  const [
    { data: progressRows },
    xpSummary,
    streakStatus,
    radarSummary,
    badgesData,
    { data: capstoneRows },
    userCertificates,
  ] = await Promise.all([
    (supabase
      .from('user_lesson_progress') as unknown as DBChain)
      .select('lesson_id, status')
      .eq('user_id', user.id) as unknown as Promise<{
      data: Array<{ lesson_id: string; status: string }> | null
    }>,
    getUserXpSummary(supabase, user.id),
    getUserStreakStatus(supabase, user.id),
    getSkillRadarSummary(supabase, user.id),
    getUserBadgesData(supabase, user.id),
    (supabase
      .from('capstone_submissions') as unknown as DBChain)
      .select('module_slug, status')
      .eq('user_id', user.id) as unknown as Promise<{
      data: Array<{ module_slug: string; status: string }> | null
    }>,
    getUserCertificates(supabase, user.id),
  ])

  const completedLessons = progressRows?.filter((p) => p.status === 'completed').length ?? 0
  const completedPercentage = Math.min(100, Math.round((completedLessons / 90) * 100))

  // Auto-issue certificate if 90 lessons completed and no certificate exists yet
  let certificates = userCertificates
  if (completedLessons >= 90 && userCertificates.length === 0) {
    try {
      const issued = await issueCertificate(supabase, user.id, 'full_curriculum')
      certificates = [issued]
    } catch (e) {
      console.warn('Failed to auto-issue certificate:', e)
    }
  }

  // Capstones status map
  const capstoneMap = new Map<string, string>()
  if (capstoneRows) {
    for (const sub of capstoneRows) {
      capstoneMap.set(sub.module_slug, sub.status)
    }
  }

  // Map badge items for showcase
  const badgeItems = badgesData.allBadges.map((b) => ({
    key: b.definition.key,
    name: b.definition.name,
    description: b.definition.description,
    unlocked: b.isEarned,
    icon: b.definition.icon,
  }))

  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl space-y-8 pb-16">
      {/* Header */}
      <div className="border-b border-border pb-6">
        <Link
          href="/dashboard"
          className="text-xs font-semibold uppercase tracking-wider text-primary hover:underline inline-flex items-center gap-1"
        >
          ← Back to Dashboard
        </Link>
        <h1 className="text-2xl md:text-4xl font-bold font-serif text-foreground mt-3">
          My Progress &amp; Competency
        </h1>
        <p className="text-xs md:text-sm text-muted-foreground mt-1">
          Single source of truth for your product management skill radar, XP performance, capstones, and verified credentials.
        </p>
      </div>

      {/* 1. Skill Radar (DOMINANT VISUAL) */}
      <SkillRadarCard
        skillValues={radarSummary.scores}
        breakdown={radarSummary.breakdown}
        overallScore={radarSummary.overallScore}
      />

      {/* 2. Primary Performance Metrics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <LevelCard level={xpSummary.levelInfo.level} totalXp={xpSummary.totalXp} />
        <StreakCard streakStatus={streakStatus} />
        <ProgressRingCard completedLessons={completedLessons} totalLessons={90} />
      </div>

      {/* 3. Badge & Achievement Case */}
      <BadgeShowcaseCard
        unlockedCount={badgesData.totalEarned}
        totalBadges={badgesData.totalAvailable}
        badges={badgeItems}
      />

      {/* 4. Capstone Projects Section */}
      <div className="rounded-2xl border border-border bg-card p-6 space-y-4 shadow-xs">
        <div className="flex items-center justify-between border-b border-border pb-4">
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-primary" />
            <h2 className="text-xl font-bold font-serif text-foreground">
              Module Capstone Projects (9 Total)
            </h2>
          </div>
          <Link
            href="/capstones"
            className="text-xs font-bold text-primary hover:underline inline-flex items-center gap-1"
          >
            <span>View All Workspace</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {Object.values(CAPSTONE_DEFINITIONS).map((cap) => {
            const status = capstoneMap.get(cap.moduleSlug) || 'not_started'
            const isDone = status === 'submitted' || status === 'reviewed'

            return (
              <div
                key={cap.moduleSlug}
                className="p-4 rounded-xl border border-border/80 bg-card/60 space-y-2 flex flex-col justify-between"
              >
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-primary">
                      Module {cap.moduleNumber}
                    </span>
                    <span
                      className={`text-[9px] font-bold uppercase px-2 py-0.5 rounded border ${
                        isDone
                          ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'
                          : 'bg-muted text-muted-foreground border-border'
                      }`}
                    >
                      {status.replace('_', ' ')}
                    </span>
                  </div>
                  <h3 className="text-sm font-bold font-serif text-foreground">{cap.title}</h3>
                  <p className="text-[11px] text-muted-foreground line-clamp-2">{cap.deliverableType}</p>
                </div>

                <Link
                  href={`/capstones/${cap.moduleSlug}`}
                  className="mt-2 inline-flex items-center justify-between text-xs font-bold text-primary hover:underline"
                >
                  <span>{isDone ? 'View Submission' : 'Open Workspace'}</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            )
          })}
        </div>
      </div>

      {/* 5. Certificates & Credentials Section */}
      <div className="rounded-2xl border border-border bg-card p-6 space-y-6 shadow-xs">
        <div className="flex items-center justify-between border-b border-border pb-4">
          <div className="flex items-center gap-2">
            <CertIcon className="w-5 h-5 text-amber-500" />
            <h2 className="text-xl font-bold font-serif text-foreground">
              Official Certificates &amp; Credentials
            </h2>
          </div>
        </div>

        {certificates.length > 0 ? (
          <div className="space-y-4">
            {certificates.map((cert) => (
              <div
                key={cert.id}
                className="p-6 rounded-2xl border border-amber-500/30 bg-amber-500/5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4"
              >
                <div className="space-y-1">
                  <span className="text-[10px] uppercase font-bold tracking-wider text-amber-500 block">
                    Verified Credential • {cert.certificate_code}
                  </span>
                  <h3 className="text-lg font-bold font-serif text-foreground">
                    Prodily PM Academy Full Curriculum Completion Certificate
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    Issued on {new Date(cert.issued_at).toLocaleDateString()} for mastering 90 lessons and achieving Level {cert.level} ({cert.career_title}).
                  </p>
                </div>

                <Link
                  href={`/verify/${encodeURIComponent(cert.certificate_code)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-amber-500 text-white font-bold text-xs shadow-sm hover:bg-amber-600 transition-all shrink-0"
                >
                  <span>View Verified Certificate</span>
                  <ExternalLink className="w-4 h-4" />
                </Link>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-6 rounded-2xl border border-border bg-card/60 space-y-4">
            <div className="space-y-1">
              <h3 className="text-base font-bold font-serif text-foreground">
                Certificate Eligibility &amp; Progress
              </h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Earn your official PM Academy Completion Certificate by completing all 90 lessons across the 9 core modules.
              </p>
            </div>

            {/* Progress Bar toward Certificate */}
            <div className="space-y-2">
              <div className="flex justify-between text-xs font-bold font-mono">
                <span className="text-foreground">Full Curriculum Certificate Eligibility</span>
                <span className="text-primary">{completedLessons} / 90 Lessons ({completedPercentage}%)</span>
              </div>
              <div className="w-full h-3 rounded-full bg-secondary overflow-hidden">
                <div
                  className="h-full bg-primary transition-all duration-500"
                  style={{ width: `${completedPercentage}%` }}
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
