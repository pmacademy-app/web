/* eslint-disable @next/next/no-img-element */
import { ImageResponse } from 'next/og'
import { createServiceRoleClient } from '@/lib/supabase'
import { getPublicPortfolioData } from '@/lib/portfolio-db'
import { BRAND } from '@/lib/brand'
import { OG, ProdilyLogoMark } from '@/lib/og/brand'
import { needsCanonicalOgRedirect, portfolioOgCardPath, redirectToOgCardPath } from '@/lib/og/card-paths'

/**
 * Cached, not dynamic.
 *
 * This handler renders a real 1200x630 PNG through Satori/resvg, which is by a wide
 * margin the most CPU-expensive operation in the app — roughly an order of magnitude
 * more than an ordinary route. It is referenced as the OG image of every public
 * portfolio, so every link preview, re-share and crawler visit used to re-render it
 * from scratch.
 *
 * It was previously `force-dynamic`, which kept the result out of Next's Full Route
 * Cache entirely. That also silently broke the invalidation the product already
 * performs: `revalidatePath('/api/og/portfolio/<username>')` is called when a learner
 * saves portfolio settings (app/api/settings/portfolio/route.ts) and when an admin
 * changes a profile (lib/admin/service.ts) — with no cache entry to invalidate, those
 * calls did nothing. Caching here is what makes them meaningful.
 *
 * One hour matches the `s-maxage=3600` the success path already sends, so the CDN and
 * the route cache now agree instead of contradicting each other. Correctness does not
 * depend on the interval: the two `revalidatePath()` call sites above invalidate the
 * moment the underlying profile actually changes, and the entry is per-username, so a
 * cached card can never be served under a different username.
 *
 * "Per-username" means per URL path, and `revalidatePath()` is case-sensitive while the
 * lookup is not. So the card is rendered only under the trimmed lowercase username; any
 * other spelling is redirected there before the lookup (lib/og/card-paths.ts), which
 * leaves one entry per learner. The settings-save path purges that lowercase entry, for
 * the previous handle too when the username changes. The admin call sites still purge
 * the username as stored, which is the same path only while stored usernames are
 * lowercase (settings saves lowercase them). A CDN copy can outlive any purge by its
 * own `s-maxage`.
 *
 * Privacy is enforced inside the handler on every regeneration, twice —
 * `getPublicPortfolioData()` returns null for a private portfolio, and the branch
 * below re-checks `isPortfolioPublic` — so a portfolio switched to private falls back
 * to the generic card and is additionally invalidated by the settings-save path.
 *
 * `force-static` is required, not decorative: a GET Route Handler that declares the
 * `Request` argument is treated as dynamic by Next, and this one declares it (unused)
 * to reach the `{ params }` context in the second position. Without this directive
 * `revalidate` alone leaves the route dynamic — confirmed from the build route table.
 * It is safe here because the handler uses no request-scoped API: it reads only the
 * route segment and the database. Do not add `headers()`, `cookies()` or
 * `searchParams` usage below without revisiting this.
 */
export const dynamic = 'force-static'
export const revalidate = 3600


interface RouteProps {
  params: Promise<{ username: string }>
}

/** Minimal outline icons (lucide-equivalent paths) drawn by hand so the OG
 * route has no runtime dependency on lucide-react inside next/og's Satori
 * renderer — same approach as ProdilyLogoMark above. */
function FolderIcon({ size = 26, color }: { size?: number; color: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={{ display: 'flex' }}>
      <path
        d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function BarChartIcon({ size = 26, color }: { size?: number; color: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={{ display: 'flex' }}>
      <path d="M3 3v16a2 2 0 0 0 2 2h16" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <path d="M18 17V9" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <path d="M13 17V5" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <path d="M8 17v-3" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function LinkIcon({ size = 16, color }: { size?: number; color: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={{ display: 'flex' }}>
      <path d="M9 17H7A5 5 0 0 1 7 7h2" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <path d="M15 7h2a5 5 0 1 1 0 10h-2" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <path d="M8 12h8" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export async function GET(request: Request, { params }: RouteProps) {
  try {
    const { username } = await params
    if (needsCanonicalOgRedirect(username)) {
      return redirectToOgCardPath(portfolioOgCardPath(username))
    }
    const supabase = createServiceRoleClient()
    const portfolio = await getPublicPortfolioData(supabase, username)

    // 1. Private / Unavailable Portfolio Fallback Card
    if (!portfolio || !portfolio.user.isPortfolioPublic) {
      return new ImageResponse(
        (
          <div
            style={{
              height: '100%',
              width: '100%',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: OG.background,
              backgroundImage:
                `radial-gradient(circle at 12% 15%, rgba(1, 158, 117, 0.10), transparent 45%), radial-gradient(circle at 88% 85%, rgba(217, 139, 36, 0.08), transparent 45%)`,
              color: OG.foreground,
              fontFamily: 'sans-serif',
              padding: '60px',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: '8px 20px',
                borderRadius: '9999px',
                backgroundColor: OG.surface,
                border: `1px solid ${OG.border}`,
                color: OG.muted,
                fontSize: '16px',
                fontWeight: 700,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                marginBottom: '28px',
              }}
            >
              🔒 Private Portfolio
            </div>

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '14px',
                marginBottom: '16px',
              }}
            >
              <ProdilyLogoMark size={42} />
              <span
                style={{
                  fontSize: '44px',
                  fontWeight: 800,
                  letterSpacing: '-0.02em',
                  color: OG.foreground,
                }}
              >
                @{username}
              </span>
            </div>

            <p
              style={{
                fontSize: '22px',
                color: OG.muted,
                maxWidth: '680px',
                textAlign: 'center',
                lineHeight: 1.5,
                margin: '0 0 36px 0',
              }}
            >
              This Product Management learning portfolio is private or restricted by its owner.
            </p>

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                fontSize: '15px',
                color: OG.primary,
                fontWeight: 700,
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
              }}
            >
              <span>{BRAND.company}</span>
            </div>
          </div>
        ),
        {
          width: 1200,
          height: 630,
          headers: {
            'Content-Type': 'image/png',
            'Cache-Control': 'public, max-age=60, s-maxage=300, stale-while-revalidate=600',
          },
        }
      )
    }

    const { user, capstones, skillRadar } = portfolio

    // Extract dynamic display fields with safe fallbacks and bounded lengths
    const displayName = user.name && user.name.trim().length > 0 ? user.name.trim() : 'PM Learner'
    const nameFontSize = displayName.length > 28 ? '36px' : displayName.length > 20 ? '42px' : '48px'

    const rawBio = user.bio && user.bio.trim().length > 0 ? user.bio.trim() : ''
    const displayBio = rawBio.length > 0
      ? (rawBio.length > 175 ? `${rawBio.slice(0, 172).trim()}...` : rawBio)
      : 'Product Management portfolio showcasing applied capstones, competency evaluation, and structured PM deliverables.'

    // Proof-of-Work: Public Capstones
    const publicCapstones = Array.isArray(capstones) ? capstones : []
    const capstoneCount = publicCapstones.length
    const projectText = capstoneCount === 1 ? '1 Public Project' : `${capstoneCount} Public Projects`

    // Evaluated Core Competencies (top clusters from Skill Radar)
    const topClusters: string[] = skillRadar?.breakdown && skillRadar.breakdown.length > 0
      ? skillRadar.breakdown.slice(0, 4).map((b) => b.label)
      : ['Discovery', 'Strategy', 'Execution', 'Growth']

    return new ImageResponse(
      (
        <div
          style={{
            height: '100%',
            width: '100%',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            backgroundColor: OG.background,
            backgroundImage:
              `radial-gradient(circle at 6% 10%, rgba(1, 158, 117, 0.12), transparent 42%), radial-gradient(circle at 94% 90%, rgba(217, 139, 36, 0.08), transparent 42%)`,
            color: OG.foreground,
            fontFamily: 'sans-serif',
            padding: '48px 56px',
            position: 'relative',
          }}
        >
          {/* Top Brand Header Bar */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              width: '100%',
            }}
          >
            {/* Prodily Official Brand Lockup */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
              }}
            >
              <ProdilyLogoMark size={38} />
              <span
                style={{
                  fontSize: '32px',
                  fontWeight: 800,
                  letterSpacing: '-0.02em',
                  color: OG.foreground,
                  lineHeight: 1,
                }}
              >
                Prodily
              </span>
            </div>

            {/* Contextual Status Badge — accent gold for Fellow, matching the theme's own accent token */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '10px 22px',
                borderRadius: '9999px',
                backgroundColor: user.isFellow ? 'rgba(217, 139, 36, 0.12)' : OG.surface,
                border: user.isFellow ? `1px solid rgba(217, 139, 36, 0.4)` : `1px solid ${OG.border}`,
                color: user.isFellow ? OG.accent : OG.foreground,
                fontSize: '15px',
                fontWeight: 700,
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
              }}
            >
              {user.isFellow ? '★ PM Fellow at Prodily' : 'Product Portfolio'}
            </div>
          </div>

          {/* Center Identity & Bio Card */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '20px',
              backgroundColor: OG.surface,
              border: `1px solid ${OG.border}`,
              borderRadius: '24px',
              padding: '32px 36px',
              boxShadow: '0 8px 24px rgba(23, 26, 23, 0.06)',
            }}
          >
            {/* Identity Row */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '24px',
              }}
            >
              {user.avatarUrl ? (
                <img
                  src={user.avatarUrl}
                  alt={displayName}
                  style={{
                    width: '104px',
                    height: '104px',
                    borderRadius: '9999px',
                    objectFit: 'cover',
                  }}
                />
              ) : (
                <div
                  style={{
                    width: '104px',
                    height: '104px',
                    borderRadius: '9999px',
                    background: `linear-gradient(135deg, ${OG.surfaceMuted} 0%, ${OG.primary} 100%)`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '44px',
                    fontWeight: 800,
                    color: OG.surface,
                  }}
                >
                  {displayName.charAt(0).toUpperCase()}
                </div>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <h1
                  style={{
                    fontSize: nameFontSize,
                    fontWeight: 800,
                    margin: 0,
                    letterSpacing: '-0.025em',
                    color: OG.foreground,
                    lineHeight: 1.15,
                  }}
                >
                  {displayName}
                </h1>

                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                  }}
                >
                  <span
                    style={{
                      fontSize: '19px',
                      fontWeight: user.isFellow ? 700 : 600,
                      color: user.isFellow ? OG.accent : OG.muted,
                    }}
                  >
                    {user.isFellow ? 'Product Management Fellow at Prodily' : 'Product Management Portfolio'}
                  </span>
                  <span style={{ color: OG.border, fontSize: '18px' }}>•</span>
                  <span
                    style={{
                      fontSize: '17px',
                      color: OG.muted,
                      fontWeight: 600,
                      fontFamily: 'monospace',
                    }}
                  >
                    @{user.username}
                  </span>
                </div>
              </div>
            </div>

            {/* Professional Headline / Bio */}
            <p
              style={{
                fontSize: '20px',
                color: OG.muted,
                margin: 0,
                lineHeight: 1.45,
                maxWidth: '1000px',
              }}
            >
              {displayBio}
            </p>
          </div>

          {/* Bottom Proof-of-Work & Competencies Row */}
          <div
            style={{
              display: 'flex',
              gap: '20px',
              width: '100%',
            }}
          >
            {/* Applied Deliverables Card */}
            <div
              style={{
                flex: 1,
                padding: '18px 24px',
                borderRadius: '18px',
                backgroundColor: OG.surface,
                border: `1px solid ${OG.border}`,
                display: 'flex',
                alignItems: 'center',
                gap: '16px',
                boxShadow: '0 4px 14px rgba(23, 26, 23, 0.05)',
              }}
            >
              <div
                style={{
                  width: '52px',
                  height: '52px',
                  borderRadius: '14px',
                  backgroundColor: 'rgba(1, 158, 117, 0.12)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <FolderIcon size={26} color={OG.primary} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <span
                  style={{
                    fontSize: '12px',
                    color: OG.muted,
                    fontWeight: 700,
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                  }}
                >
                  Applied Proof of Work
                </span>
                <span
                  style={{
                    fontSize: '22px',
                    fontWeight: 800,
                    color: OG.foreground,
                  }}
                >
                  {projectText}
                </span>
              </div>
            </div>

            {/* Core Competencies Card */}
            <div
              style={{
                flex: 1.4,
                padding: '18px 24px',
                borderRadius: '18px',
                backgroundColor: OG.surface,
                border: `1px solid ${OG.border}`,
                display: 'flex',
                alignItems: 'center',
                gap: '16px',
                boxShadow: '0 4px 14px rgba(23, 26, 23, 0.05)',
              }}
            >
              <div
                style={{
                  width: '52px',
                  height: '52px',
                  borderRadius: '14px',
                  backgroundColor: 'rgba(1, 158, 117, 0.12)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <BarChartIcon size={26} color={OG.primary} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <span
                  style={{
                    fontSize: '12px',
                    color: OG.muted,
                    fontWeight: 700,
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                  }}
                >
                  Evaluated PM Competencies
                </span>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  {topClusters.map((clusterName: string, idx: number) => (
                    <span
                      key={idx}
                      style={{
                        fontSize: '13px',
                        fontWeight: 600,
                        color: OG.primary,
                        backgroundColor: 'rgba(1, 158, 117, 0.10)',
                        border: '1px solid rgba(1, 158, 117, 0.18)',
                        padding: '4px 12px',
                        borderRadius: '10px',
                      }}
                    >
                      {clusterName}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Footer Bar */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              fontSize: '14px',
              color: OG.muted,
              borderTop: `1px solid ${OG.border}`,
              paddingTop: '16px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <LinkIcon size={16} color={OG.primary} />
              <span style={{ color: OG.foreground, fontWeight: 600, fontFamily: 'monospace' }}>
                {BRAND.domain}/p/{user.username}
              </span>
            </div>
            <span style={{ fontWeight: 500 }}>
              Show your work. Show how you think. · Prodily
            </span>
          </div>
        </div>
      ),
      {
        width: 1200,
        height: 630,
        headers: {
          'Content-Type': 'image/png',
          'Cache-Control': 'public, max-age=60, s-maxage=3600, stale-while-revalidate=86400',
        },
      }
    )
  } catch (error) {
    console.error('[API GET /api/og/portfolio/[username]] Error:', error)
    return new Response('Failed to generate OpenGraph preview image', { status: 500 })
  }
}
