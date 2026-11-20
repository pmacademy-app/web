import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getDedupedPublicPortfolioData, DEFAULT_PORTFOLIO_LAYOUT } from '@/lib/portfolio/portfolio-db'
import { generateProfilePageJsonLd, formatPortfolioShareUrl } from '@/lib/portfolio/portfolio'
import { portfolioOgCardPath } from '@/lib/og/card-paths'
import { PortfolioHero } from '@/components/portfolio/PortfolioHero'
import { PortfolioSkillRadar } from '@/components/portfolio/PortfolioSkillRadar'
import { PortfolioProgress } from '@/components/portfolio/PortfolioProgress'
import { PortfolioCapstones } from '@/components/portfolio/PortfolioCapstones'
import { PortfolioAchievements } from '@/components/portfolio/PortfolioAchievements'
import { FeaturedCapstoneCard } from '@/components/portfolio/FeaturedCapstoneCard'
import { PortfolioViewBeacon } from '@/components/portfolio/PortfolioViewBeacon'
import { Lock, ArrowLeft } from 'lucide-react'
import { BRAND } from '@/lib/brand'

import { safeJsonLd } from '@/lib/seo/safe-json-ld'

interface PageProps {
  params: Promise<{ username: string }>
}

const SITE_ORIGIN = process.env.NEXT_PUBLIC_SITE_URL || BRAND.siteUrl

/**
 * Cached per username (ISR, perf plan item 13), like /verify/[certificateId].
 *
 * The render is the same for every viewer: it reads no cookies, headers or search params,
 * and nothing in it depends on who is looking. The view counter, the one per-visit part,
 * runs from a client beacon (PortfolioViewBeacon) instead of during render.
 *
 * Privacy: a private or unknown portfolio renders the "unavailable" state and that is
 * cached too. Every write that changes what this page shows purges its exact path through
 * lib/portfolio/portfolio-revalidate.ts (visibility and profile saves, username changes old and new,
 * capstone submit and review, capstone reflections, account deletion), so going private
 * takes effect on the next request. The hour only bounds drift in numbers no write purges
 * for, such as XP, streak and lesson progress.
 *
 * `generateStaticParams` returning [] with `dynamicParams` prerenders nothing at build and
 * caches each portfolio on its first request.
 */
export const revalidate = 3600
export const dynamicParams = true
export async function generateStaticParams(): Promise<Array<{ username: string }>> {
  return []
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { username } = await params
  const cleanUsername = username.toLowerCase()
  const portfolio = await getDedupedPublicPortfolioData(cleanUsername)

  if (!portfolio || !portfolio.user.isPortfolioPublic) {
    return {
      title: 'Private Portfolio',
      description: `This ${BRAND.fullName} learning portfolio is private.`,
      robots: { index: false, follow: false },
    }
  }

  const { name, bio, isFellow } = portfolio.user
  const shareUrl = formatPortfolioShareUrl(SITE_ORIGIN, cleanUsername)
  const ogImageUrl = `${SITE_ORIGIN}${portfolioOgCardPath(cleanUsername)}`

  const metaTitle = isFellow
    ? `${name} | Product Management Fellow at Prodily | Portfolio`
    : `${name} | Product Portfolio`

  const metaDesc = isFellow
    ? (bio
        ? `${name}, Product Management Fellow at Prodily. ${bio}`
        : `${name}, Product Management Fellow at Prodily. Explore applied Product Management capstones, continuous skill radar, and case studies on ${BRAND.fullName}.`)
    : (bio
        ? `${name}'s Product Management portfolio and applied capstones on ${BRAND.fullName}. ${bio}`
        : `Explore ${name}'s Product Management portfolio, continuous skill radar, and applied case studies on ${BRAND.fullName}.`)

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
          alt: metaTitle,
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
  if (username !== username.toLowerCase()) {
    redirect(`/p/${username.toLowerCase()}`)
  }
  const portfolio = await getDedupedPublicPortfolioData(username.toLowerCase())

  // Private or non-existent profile state
  if (!portfolio) {
    return (
      <div className="min-h-screen bg-background text-foreground flex items-center justify-center p-4">
        <div className="max-w-md w-full rounded-2xl border border-border bg-card p-8 text-center space-y-4 shadow-sm">
          <div className="p-3 rounded-2xl bg-amber-500/10 text-warning w-fit mx-auto">
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

  // Generate ProfilePage + Person Schema JSON-LD
  const profilePageJsonLd = generateProfilePageJsonLd({
    name: user.name,
    username: user.username,
    bio: user.bio,
    avatarUrl: user.avatarUrl,
    linkedinUrl: user.linkedinUrl,
    githubUrl: user.githubUrl,
    websiteUrl: user.websiteUrl,
    siteOrigin: SITE_ORIGIN,
    isFellow: user.isFellow,
  })

  // Dynamic section renderer for user-customized order
  const renderSection = (sectionId: string) => {
    switch (sectionId) {
      case 'radar':
        return <PortfolioSkillRadar key="radar" skillRadar={skillRadar} />
      case 'progress':
        return <PortfolioProgress key="progress" progress={progress} />
      case 'capstones':
        return <PortfolioCapstones key="capstones" capstones={capstones} username={username} />
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
      {/* Schema.org ProfilePage & Person Structured Data */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLd(profilePageJsonLd) }}
      />

      <PortfolioViewBeacon username={user.username} />

      <div className="max-w-5xl mx-auto space-y-8">
        {/* Portfolio Hero */}
        <PortfolioHero user={user} />

        {/* Featured Deliverable Spotlight Card (if set and public) */}
        {featuredCapstone && (
          <FeaturedCapstoneCard capstone={featuredCapstone} />
        )}

        {/* User-Configured Section Layout */}
        {dynamicSections.map(renderSection)}

        {/* Footer Branding */}
        <div className="text-center pt-8 border-t border-border/60 text-xs text-muted-foreground space-y-1">
          <p>
            Product Management Learning Record powered by{' '}
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
