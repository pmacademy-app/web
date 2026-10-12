import { ImageResponse } from 'next/og'
import { createServiceRoleClient } from '@/lib/supabase'
import { getPublicPortfolioData } from '@/lib/portfolio-db'
import { findPublicCapstone } from '@/lib/portfolio-capstone-page'
import { BRAND } from '@/lib/brand'
import { OG, ProdilyLogoMark } from '@/lib/og/brand'
import { capstoneOgCardPath, needsCanonicalOgRedirect, redirectToOgCardPath } from '@/lib/og/card-paths'

/**
 * OG image for one public capstone page (Growth R5 / B13b).
 *
 * Cached like the portfolio card (app/api/og/portfolio/[username]/route.tsx, see its comment for
 * why `force-static` is needed with a declared Request argument). Privacy is checked on every
 * regeneration through findPublicCapstone, the same rule the page uses: a capstone that is not on
 * the public portfolio gets the generic brand card, never its title.
 *
 * The cache is per URL path and the username lookup ignores case, so a titled card is rendered
 * only under the lowercase username; any other spelling is redirected there before the lookup
 * (lib/og/card-paths.ts). That keeps one entry per learner and capstone, which is the entry
 * revalidateCapstoneOgCards purges when the portfolio goes private, the capstone is unpublished or
 * the username changes. A CDN copy can still outlive the purge by its own s-maxage.
 */
export const dynamic = 'force-static'
export const revalidate = 3600

interface RouteProps {
  params: Promise<{ username: string; moduleSlug: string }>
}

const SIZE = { width: 1200, height: 630 }

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        height: '100%',
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        backgroundColor: OG.background,
        backgroundImage:
          'radial-gradient(circle at 12% 15%, rgba(1, 158, 117, 0.10), transparent 45%), radial-gradient(circle at 88% 85%, rgba(217, 139, 36, 0.08), transparent 45%)',
        color: OG.foreground,
        fontFamily: 'sans-serif',
        padding: '64px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
        <ProdilyLogoMark size={40} />
        <div style={{ display: 'flex', fontSize: '26px', fontWeight: 700 }}>{BRAND.fullName}</div>
      </div>
      {children}
    </div>
  )
}

export async function GET(request: Request, { params }: RouteProps) {
  try {
    const { username, moduleSlug } = await params
    if (needsCanonicalOgRedirect(username)) {
      return redirectToOgCardPath(capstoneOgCardPath(username, moduleSlug))
    }
    const portfolio = await getPublicPortfolioData(createServiceRoleClient(), username)
    const capstone = findPublicCapstone(portfolio, moduleSlug)

    if (!portfolio || !capstone) {
      return new ImageResponse(
        (
          <Frame>
            <div style={{ display: 'flex', fontSize: '48px', fontWeight: 700 }}>Applied product management capstones</div>
          </Frame>
        ),
        { ...SIZE, headers: { 'Cache-Control': 'public, max-age=60, s-maxage=300, stale-while-revalidate=600' } },
      )
    }

    const title = capstone.title.length > 90 ? `${capstone.title.slice(0, 87)}...` : capstone.title
    return new ImageResponse(
      (
        <Frame>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div
              style={{
                display: 'flex',
                alignSelf: 'flex-start',
                padding: '8px 18px',
                borderRadius: '9999px',
                backgroundColor: OG.surface,
                border: `1px solid ${OG.border}`,
                color: OG.primary,
                fontSize: '18px',
                fontWeight: 700,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
              }}
            >
              Case study · {capstone.deliverableType}
            </div>
            <div style={{ display: 'flex', fontSize: '60px', fontWeight: 800, lineHeight: 1.1 }}>{title}</div>
            <div style={{ display: 'flex', fontSize: '28px', color: OG.muted }}>
              Module {capstone.moduleNumber} · {capstone.moduleTitle}
            </div>
          </div>
          <div style={{ display: 'flex', fontSize: '26px', fontWeight: 600 }}>by {portfolio.user.name}</div>
        </Frame>
      ),
      { ...SIZE, headers: { 'Cache-Control': 'public, max-age=60, s-maxage=3600, stale-while-revalidate=600' } },
    )
  } catch (err) {
    console.error('[og/capstone] render failed:', err instanceof Error ? err.message : err)
    return new Response('Failed to generate image', { status: 500 })
  }
}
