import type { Metadata } from 'next'
import Link from 'next/link'
import { createServiceRoleClient } from '@/lib/supabase'
import { getPublicPortfolioData, DEFAULT_PORTFOLIO_LAYOUT } from '@/lib/portfolio-db'
import { generatePersonJsonLd, formatPortfolioShareUrl } from '@/lib/portfolio'
import { PortfolioHero } from '@/components/portfolio/PortfolioHero'
import { PortfolioSkillRadar } from '@/components/portfolio/PortfolioSkillRadar'
import { PortfolioProgress } from '@/components/portfolio/PortfolioProgress'
import { PortfolioCapstones } from '@/components/portfolio/PortfolioCapstones'
import { PortfolioAchievements } from '@/components/portfolio/PortfolioAchievements'
import { FeaturedCapstoneCard } from '@/components/portfolio/FeaturedCapstoneCard'
import { Lock, ArrowLeft } from 'lucide-react'
import { BRAND } from '@/lib/brand'

interface PageProps {
  params: Promise<{ username: string }>
}

const SITE_ORIGIN = process.env.NEXT_PUBLIC_SITE_URL || BRAND.siteUrl

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { username } = await params
  const supabase = createServiceRoleClient()
  const portfolio = await getPublicPortfolioData(supabase, username)

  if (!portfolio || !portfolio.user.isPortfolioPublic) {
    return {
      title: 'Private Portfolio',
      description: `This ${BRAND.fullName} learning portfolio is private.`,
      robots: { index: false, follow: false },
    }
  }

  const { name, bio, levelInfo, totalXp } = portfolio.user
  const shareUrl = formatPortfolioShareUrl(SITE_ORIGIN, username)
  const ogImageUrl = `${SITE_ORIGIN}/api/og/portfolio/${username}`

  const metaTitle = `${name}'s PM Portfolio & Skill Radar`
  const metaDesc = bio
    ? `${name} — ${levelInfo.title} (${totalXp} XP). ${bio}`
    : `Explore ${name}'s verified Product Management portfolio, continuous skill radar, and applied module capstones on ${BRAND.fullName}.`

  return {
    title: metaTitle,
    description: metaDesc,
    alternates: {
      canonical: shareUrl,
    },
    robots: {
      index: true,
      follow: true,
    },
    openGraph: {
      type: 'profile',
      title: metaTitle,
      description: metaDesc,
      url: shareUrl,
      images: [
        {
          url: ogImageUrl,
          width: 1200,
          height: 630,
          alt: `${name}'s Verified PM Portfolio & Skill Radar`,
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title: metaTitle,
      description: metaDesc,
      images: [ogImageUrl],
    },
  }
}

export default async function PublicPortfolioPage({ params }: PageProps) {
  const { username } = await params
  const supabase = createServiceRoleClient()
  const portfolio = await getPublicPortfolioData(supabase, username)

  // Private or non-existent profile state
  if (!portfolio) {
    return (
      <div className="min-h-screen bg-background text-foreground flex items-center justify-center p-4">
        <div className="max-w-md w-full rounded-2xl border border-border bg-card p-8 text-center space-y-4 shadow-sm">
          <div className="p-3 rounded-2xl bg-amber-500/10 text-amber-500 w-fit mx-auto">
            <Lock className="w-8 h-8" />
          </div>
          <h1 className="text-xl font-bold font-serif text-foreground">
            Portfolio Unavailable or Private
          </h1>
          <p className="text-xs text-muted-foreground leading-relaxed">
            The profile <strong className="font-mono text-foreground">@{username}</strong> is either private, does not exist, or has been restricted by the author.
          </p>
          <Link
            href="/"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground font-bold text-xs hover:bg-primary/90 transition-colors pt-2"
          >
            <ArrowLeft className="w-4 h-4" /> Back to {BRAND.product} Home
          </Link>
        </div>
      </div>
    )
  }

  const { user, progress, skillRadar, capstones, featuredCapstone } = portfolio
  const layout = user.portfolioLayout || DEFAULT_PORTFOLIO_LAYOUT

  // Generate Person Schema JSON-LD
  const personJsonLd = generatePersonJsonLd({
    name: user.name,
    username: user.username,
    title: user.levelInfo.title,
    bio: user.bio,
    avatarUrl: user.avatarUrl,
    linkedinUrl: user.linkedinUrl,
    githubUrl: user.githubUrl,
    websiteUrl: user.websiteUrl,
    siteOrigin: SITE_ORIGIN,
  })

  // Dynamic section renderer for user-customized order
  const renderSection = (sectionId: string) => {
    switch (sectionId) {
      case 'radar':
        return <PortfolioSkillRadar key="radar" skillRadar={skillRadar} />
      case 'progress':
        return <PortfolioProgress key="progress" progress={progress} />
      case 'capstones':
        return <PortfolioCapstones key="capstones" capstones={capstones} />
      case 'achievements':
        return (
          <PortfolioAchievements
            key="achievements"
            user={user}
            progress={progress}
            capstonesCount={capstones.length}
          />
        )
      default:
        return null
    }
  }

  // Filter hero from dynamic sections so header remains anchored at top
  const dynamicSections = layout.filter((s) => s !== 'hero')

  return (
    <div className="min-h-screen bg-background text-foreground py-8 md:py-12 px-4">
      {/* Schema.org Person Structured Data */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(personJsonLd) }}
      />

      <div className="max-w-5xl mx-auto space-y-8">
        {/* Portfolio Hero */}
        <PortfolioHero user={user} />

        {/* Featured Deliverable Spotlight Card (if set and public) */}
        {featuredCapstone && (
          <FeaturedCapstoneCard capstone={featuredCapstone} />
        )}

        {/* User-Configured Section Layout */}
        {dynamicSections.map(renderSection)}

        {/* Verified Footer Branding */}
        <div className="text-center pt-8 border-t border-border/60 text-xs text-muted-foreground space-y-1">
          <p>
            Verified Product Management Learning Record powered by{' '}
            <Link href="/" className="font-bold text-primary hover:underline">
              {BRAND.product}
            </Link>
            .
          </p>
          <p className="text-[11px] text-muted-foreground/60">
            90 lessons · 9 modules · 0 dark patterns · Static-first verified architecture.
          </p>
        </div>
      </div>
    </div>
  )
}
