import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, Award, Calendar, FileText, MessageSquare } from 'lucide-react'
import { getDedupedPublicPortfolioData } from '@/lib/portfolio-db'
import { formatCapstoneShareUrl, formatPortfolioShareUrl } from '@/lib/portfolio'
import { buildCapstoneJsonLd, findPublicCapstone } from '@/lib/portfolio-capstone-page'
import { safeJsonLd } from '@/lib/seo/safe-json-ld'
import { BRAND } from '@/lib/brand'
import { CapstoneShare } from '@/components/portfolio/CapstoneShare'

/**
 * One public capstone as its own shareable page (Growth R5 / B13a).
 *
 * Reads the same request-deduped public portfolio data as /p/[username], so it inherits every
 * privacy rule there and shows nothing the portfolio does not. Any miss (unknown or private
 * portfolio, unknown slug, opted-out or unsubmitted capstone) is the same 404.
 */

interface PageProps {
  params: Promise<{ username: string; moduleSlug: string }>
}

const SITE_ORIGIN = process.env.NEXT_PUBLIC_SITE_URL || BRAND.siteUrl

async function load(params: PageProps['params']) {
  const { username, moduleSlug } = await params
  const portfolio = await getDedupedPublicPortfolioData(username)
  const capstone = findPublicCapstone(portfolio, moduleSlug)
  return capstone && portfolio ? { portfolio, capstone } : null
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const found = await load(params)
  if (!found) {
    return { title: 'Case study not found', robots: { index: false, follow: false } }
  }

  const { portfolio, capstone } = found
  const { username, name } = portfolio.user
  const url = formatCapstoneShareUrl(SITE_ORIGIN, username, capstone.moduleSlug)
  const ogImageUrl = `${SITE_ORIGIN.replace(/\/$/, '')}/api/og/portfolio/${encodeURIComponent(username)}/capstones/${encodeURIComponent(capstone.moduleSlug)}`
  const title = `${capstone.title} | ${name} | Case Study`
  const description = `${name}'s ${capstone.deliverableType.toLowerCase()} for ${capstone.moduleTitle}, an applied product management capstone on ${BRAND.fullName}.`

  return {
    title,
    description,
    alternates: { canonical: url },
    robots: { index: true, follow: true },
    openGraph: {
      type: 'article',
      title,
      description,
      url,
      images: [{ url: ogImageUrl, width: 1200, height: 630, alt: title }],
    },
    twitter: { card: 'summary_large_image', title, description, images: [ogImageUrl] },
  }
}

export default async function PublicCapstonePage({ params }: PageProps) {
  const found = await load(params)
  if (!found) notFound()

  const { portfolio, capstone } = found
  const { username, name } = portfolio.user
  const portfolioUrl = formatPortfolioShareUrl(SITE_ORIGIN, username)
  const pageUrl = formatCapstoneShareUrl(SITE_ORIGIN, username, capstone.moduleSlug)
  const jsonLd = buildCapstoneJsonLd({
    capstone,
    authorName: name,
    portfolioUrl,
    pageUrl,
    publisherName: BRAND.fullName,
  })
  const submitted = new Date(capstone.submittedAt).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })

  return (
    <div className="min-h-screen bg-background text-foreground py-8 md:py-12 px-4">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(jsonLd) }} />

      <article className="max-w-3xl mx-auto space-y-6">
        <Link
          href={`/p/${encodeURIComponent(username)}`}
          className="inline-flex items-center gap-1.5 text-xs font-bold text-primary hover:underline rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
          {name}&apos;s portfolio
        </Link>

        <header className="space-y-3 border-b border-border pb-6">
          <p className="text-[11px] font-bold uppercase tracking-wider text-primary flex items-center gap-1.5">
            <Award className="w-3.5 h-3.5" aria-hidden="true" />
            Module {capstone.moduleNumber} · {capstone.moduleTitle}
          </p>
          <h1 className="text-2xl md:text-3xl font-bold font-serif text-foreground text-balance">{capstone.title}</h1>
          <p className="text-xs text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-1">
            <span className="inline-flex items-center gap-1">
              <FileText className="w-3.5 h-3.5" aria-hidden="true" /> {capstone.deliverableType}
            </span>
            <span className="inline-flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5" aria-hidden="true" /> {submitted}
            </span>
            <span>{capstone.wordCount.toLocaleString()} words</span>
            <span>by {name}</span>
          </p>
          <div className="pt-1">
            <CapstoneShare username={username} name={name} moduleSlug={capstone.moduleSlug} title={capstone.title} />
          </div>
        </header>

        {capstone.learningObjectives.length > 0 && (
          <section aria-labelledby="objectives" className="rounded-2xl border border-border bg-card p-5 space-y-2">
            <h2 id="objectives" className="text-sm font-bold font-serif text-foreground">
              What this case study demonstrates
            </h2>
            <ul className="list-disc pl-5 space-y-1 text-xs text-muted-foreground leading-relaxed">
              {capstone.learningObjectives.map((objective) => (
                <li key={objective}>{objective}</li>
              ))}
            </ul>
          </section>
        )}

        {/* Plain text, as on the portfolio: React escapes it, nothing is rendered as HTML. */}
        <section className="text-sm text-foreground leading-relaxed whitespace-pre-line">{capstone.content}</section>

        {capstone.reflection && (
          <section aria-labelledby="reflection" className="rounded-2xl border border-border bg-card p-5 space-y-2">
            <h2 id="reflection" className="text-sm font-bold font-serif text-foreground flex items-center gap-1.5">
              <MessageSquare className="w-4 h-4 text-primary" aria-hidden="true" /> Reflection
            </h2>
            <p className="text-xs text-muted-foreground leading-relaxed whitespace-pre-line">
              &ldquo;{capstone.reflection.content}&rdquo;
            </p>
          </section>
        )}

        <footer className="border-t border-border pt-6 text-xs text-muted-foreground">
          An applied capstone from {BRAND.fullName}.{' '}
          <Link href={`/p/${encodeURIComponent(username)}`} className="font-bold text-primary hover:underline">
            See {name}&apos;s full portfolio
          </Link>
        </footer>
      </article>
    </div>
  )
}
