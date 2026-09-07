/* eslint-disable @next/next/no-img-element */
import { ImageResponse } from 'next/og'
import { createServiceRoleClient } from '@/lib/supabase'
import { getPublicPortfolioData } from '@/lib/portfolio-db'
import { BRAND } from '@/lib/brand'
import { TOKENS } from '@/theme/tokens'

export const dynamic = 'force-dynamic'

/**
 * OG card palette — sourced directly from the app's own PUBLIC light theme
 * tokens (theme/tokens.ts `colors`, the same tokens the rest of the product
 * UI uses) plus the exact logo colors (public/brand/logo-mark.svg: #019E75 /
 * #011229), matching the existing static brand asset (public/brand/og-image.png:
 * light background, deep navy headline text, green accent, soft white cards).
 * The PREVIOUS dark-navy/admin-console-styled version did not match this at
 * all — this redesign intentionally does not invent any new colors.
 *
 * No custom font is loaded (Satori's default sans is used): fetching a font
 * remotely per-instance would add an external runtime dependency to a
 * reliability-critical, publicly-shared image endpoint for a cosmetic gain.
 */
const OG = {
  background: TOKENS.colors.background, // '#FBFAF6'
  surface: TOKENS.colors.surface, // '#FFFFFF'
  surfaceMuted: TOKENS.colors.surfaceMuted, // '#F2EFE7'
  border: TOKENS.colors.border, // '#DED8CB'
  foreground: TOKENS.colors.foreground, // '#171A17'
  muted: TOKENS.colors.textMuted, // '#70685A'
  primary: TOKENS.colors.primary, // '#1F6B4E'
  accent: TOKENS.colors.accent, // '#D98B24' — used for the Fellow distinction, matches the theme's own accent token
  logoGreen: '#019E75', // exact logo-mark.svg color, used only for the logo graphic itself
} as const

interface RouteProps {
  params: Promise<{ username: string }>
}

/** Official Prodily Logo Mark (exact path + colors from public/brand/logo-mark.svg). */
function ProdilyLogoMark({ size = 38 }: { size?: number }) {
  const height = Math.round((size * 497.69) / 422.46)
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 422.46 497.69"
      width={size}
      height={height}
      style={{ display: 'flex' }}
    >
      <g transform="translate(-26.042, -15.75)">
        <path
          d="M 230.058 17.102 C 227.675 18.054, 220.969 22.171, 158 61.340 C 115.337 87.878, 86.349 105.850, 59 122.719 C 45.786 130.869, 33.884 138.945, 31.808 141.170 C 29.182 143.984, 27.804 146.629, 27.037 150.323 C 26.293 153.907, 26.042 190.561, 26.229 268.509 L 26.500 381.500 29.277 386.223 C 31.108 389.339, 33.661 391.870, 36.777 393.659 C 39.374 395.151, 43.302 397.583, 45.505 399.065 C 47.708 400.547, 51.083 402.653, 53.005 403.746 C 56.412 405.683, 98.029 431.377, 107 437.082 L 111.500 439.943 112 327.222 C 112.494 215.753, 112.523 214.461, 114.555 211.002 C 116.071 208.421, 121.050 204.691, 133.555 196.768 C 142.875 190.863, 152.525 184.718, 155 183.112 C 157.475 181.506, 171.425 172.672, 186 163.481 C 200.575 154.289, 215.425 144.854, 219 142.512 C 235.346 131.809, 239.460 130.486, 244 134.473 C 244.825 135.198, 255.175 141.838, 267 149.229 C 305.824 173.497, 321.463 183.323, 324 185.043 C 325.375 185.976, 329.650 188.731, 333.500 191.166 C 351.647 202.645, 358.763 207.583, 360.555 209.941 C 362.452 212.436, 362.507 215.323, 362.763 326.250 C 362.907 388.813, 363.263 440, 363.553 440 C 363.843 440, 365.300 439.158, 366.790 438.129 C 368.281 437.099, 375.575 432.539, 383 427.994 C 390.425 423.449, 400.550 417.159, 405.500 414.016 C 410.450 410.874, 417.650 406.419, 421.500 404.117 C 441.561 392.119, 442.421 391.489, 445.475 386.550 L 448.500 381.656 448.500 265.078 L 448.500 148.500 445.662 143.672 C 443.871 140.624, 441.171 137.860, 438.337 136.172 C 435.869 134.703, 425.671 128.382, 415.675 122.127 C 405.679 115.871, 395.475 109.533, 393 108.042 C 390.525 106.551, 365.775 91.165, 338 73.851 C 253.141 20.952, 248.143 17.901, 244.774 16.935 C 240.641 15.750, 233.233 15.834, 230.058 17.102"
          fill="#019E75"
          fillRule="evenodd"
        />
        <path
          d="M 232.816 270.366 C 217.968 279.346, 182.310 302.429, 181 303.909 C 179.692 305.388, 179.502 316.337, 179.516 389.560 C 179.532 471.475, 179.581 473.597, 181.516 476.871 C 182.970 479.329, 190.051 484.471, 208 496.098 C 221.475 504.828, 233.916 512.243, 235.648 512.577 C 240.115 513.439, 244.147 511.313, 269.500 494.735 C 283.722 485.435, 292.295 479.175, 293.750 477.027 L 296 473.704 296 389.526 L 296 305.349 293.750 303.275 C 291.377 301.087, 278.466 292.613, 253.316 276.737 L 238.131 267.151 232.816 270.366"
          fill="#011229"
        />
      </g>
    </svg>
  )
}

export async function GET(request: Request, { params }: RouteProps) {
  try {
    const { username } = await params
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
              <span>{BRAND.company} · PM Academy</span>
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
                gap: '14px',
              }}
            >
              <ProdilyLogoMark size={36} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0px' }}>
                <span
                  style={{
                    fontSize: '26px',
                    fontWeight: 800,
                    letterSpacing: '-0.02em',
                    color: OG.foreground,
                    lineHeight: 1.1,
                  }}
                >
                  Prodily
                </span>
                <span
                  style={{
                    fontSize: '11px',
                    fontWeight: 700,
                    letterSpacing: '0.18em',
                    color: OG.primary,
                    textTransform: 'uppercase',
                  }}
                >
                  PM ACADEMY
                </span>
              </div>
            </div>

            {/* Contextual Status Badge — accent gold for Fellow, matching the theme's own accent token */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '8px 18px',
                borderRadius: '9999px',
                backgroundColor: user.isFellow ? 'rgba(217, 139, 36, 0.12)' : OG.surface,
                border: user.isFellow ? `1px solid rgba(217, 139, 36, 0.4)` : `1px solid ${OG.border}`,
                color: user.isFellow ? OG.accent : OG.foreground,
                fontSize: '13px',
                fontWeight: 700,
                letterSpacing: '0.08em',
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
                    border: `3px solid ${user.isFellow ? OG.accent : OG.primary}`,
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
                    border: `3px solid ${user.isFellow ? OG.accent : OG.primary}`,
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
                flexDirection: 'column',
                gap: '4px',
                boxShadow: '0 4px 14px rgba(23, 26, 23, 0.05)',
              }}
            >
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

            {/* Core Competencies Card */}
            <div
              style={{
                flex: 1.4,
                padding: '18px 24px',
                borderRadius: '18px',
                backgroundColor: OG.surface,
                border: `1px solid ${OG.border}`,
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
                boxShadow: '0 4px 14px rgba(23, 26, 23, 0.05)',
              }}
            >
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
                      backgroundColor: OG.surfaceMuted,
                      border: `1px solid ${OG.border}`,
                      padding: '3px 10px',
                      borderRadius: '6px',
                    }}
                  >
                    {clusterName}
                  </span>
                ))}
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
            <span style={{ color: OG.foreground, fontWeight: 600, fontFamily: 'monospace' }}>
              {BRAND.domain}/p/{user.username}
            </span>
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
