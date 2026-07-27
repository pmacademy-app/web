import type { Metadata } from 'next'
import Link from 'next/link'

interface PageProps {
  params: Promise<{ username: string }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { username } = await params
  return {
    title: `${username}'s PM Portfolio & Skill Radar | PM Academy`,
    description: `View ${username}'s Product Management portfolio, skill radar, and completed module capstones on PM Academy.`,
  }
}

export default async function PublicPortfolioPage({ params }: PageProps) {
  const { username } = await params

  // Mock public profile data for SSG / SSR demonstration
  const profile = {
    username,
    name: decodeURIComponent(username).replace(/[-_]/g, ' '),
    title: 'Senior PM (Level 4)',
    streak: 14,
    totalXp: 1850,
    completedLessons: 32,
    skillRadar: {
      discovery: 75,
      strategy: 65,
      design: 80,
      execution: 85,
      growth: 60,
      leadership: 70,
      technical: 50,
    },
    publicCapstones: [
      {
        moduleNumber: 1,
        title: 'Product Thinking Foundations',
        outcome: 'Product Judgment Basics & Accountability Triangle Memo',
        submittedAt: '2026-06-15',
        content: 'Analyzed product accountability across 3 core questions and established a decision-chain framework for problem-solution fit.',
      },
    ],
  }

  return (
    <div className="min-h-screen bg-background text-foreground py-12 px-4">
      <div className="max-w-4xl mx-auto space-y-8">
        {/* Header */}
        <div className="rounded-xl border border-border bg-card p-6 md:p-8 flex flex-col md:flex-row justify-between items-start md:items-center gap-6 shadow-sm">
          <div>
            <span className="text-xs uppercase tracking-wider font-semibold text-primary">
              PM Academy Public Portfolio
            </span>
            <h1 className="text-3xl font-bold font-serif capitalize mt-1">
              {profile.name}
            </h1>
            <p className="text-sm font-medium text-muted-foreground mt-1">
              {profile.title} • {profile.totalXp} XP • {profile.completedLessons}/90 Lessons
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
              🔥 {profile.streak} Day Streak
            </span>
          </div>
        </div>

        {/* Skill Radar Overview */}
        <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
          <h2 className="text-xl font-bold font-serif mb-4">Competency Skill Radar</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {Object.entries(profile.skillRadar).map(([cluster, score]) => (
              <div key={cluster} className="rounded-lg bg-secondary/50 p-3 border border-border/50">
                <span className="text-xs font-semibold uppercase text-muted-foreground capitalize">
                  {cluster}
                </span>
                <div className="text-2xl font-bold text-primary mt-1">{score}%</div>
              </div>
            ))}
          </div>
        </div>

        {/* Verified Public Capstones */}
        <div className="space-y-4">
          <h2 className="text-xl font-bold font-serif">Verified Applied Capstones</h2>
          {profile.publicCapstones.map((cap) => (
            <div key={cap.moduleNumber} className="rounded-xl border border-border bg-card p-6 shadow-sm">
              <div className="flex justify-between items-start mb-2">
                <span className="text-xs font-semibold uppercase text-primary">
                  Module {cap.moduleNumber} Capstone
                </span>
                <span className="text-xs text-muted-foreground">{cap.submittedAt}</span>
              </div>
              <h3 className="text-lg font-bold text-foreground mb-2">{cap.title}</h3>
              <p className="text-sm text-foreground/80">{cap.content}</p>
            </div>
          ))}
        </div>

        {/* Branding Footer */}
        <div className="text-center pt-8 border-t border-border text-xs text-muted-foreground">
          Verified learning history powered by{' '}
          <Link href="/" className="font-semibold text-primary hover:underline">
            PM Academy
          </Link>
          . 90 lessons. Free forever.
        </div>
      </div>
    </div>
  )
}
