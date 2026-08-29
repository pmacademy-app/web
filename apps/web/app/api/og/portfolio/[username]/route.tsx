/* eslint-disable @next/next/no-img-element */
import { ImageResponse } from 'next/og'
import { createServiceRoleClient } from '@/lib/supabase'
import { getPublicPortfolioData } from '@/lib/portfolio-db'
import { BRAND } from '@/lib/brand'

export const dynamic = 'force-dynamic'

interface RouteProps {
  params: Promise<{ username: string }>
}

export async function GET(request: Request, { params }: RouteProps) {
  try {
    const { username } = await params
    const supabase = createServiceRoleClient()
    const portfolio = await getPublicPortfolioData(supabase, username)

    // Private / Unavailable Portfolio Fallback Card
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
              backgroundColor: '#090d16',
              backgroundImage: 'radial-gradient(circle at 50% 30%, rgba(99, 102, 241, 0.15), transparent 70%)',
              color: '#ffffff',
              fontFamily: 'sans-serif',
              padding: '60px',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: '8px 18px',
                borderRadius: '9999px',
                backgroundColor: 'rgba(239, 68, 68, 0.15)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                color: '#f87171',
                fontSize: '18px',
                fontWeight: 700,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                marginBottom: '24px',
              }}
            >
              🔒 Private Portfolio
            </div>
            <h1
              style={{
                fontSize: '48px',
                fontWeight: 800,
                margin: '0 0 16px 0',
                letterSpacing: '-0.02em',
                color: '#f1f5f9',
              }}
            >
              @{username}
            </h1>
            <p
              style={{
                fontSize: '22px',
                color: '#94a3b8',
                maxWidth: '640px',
                textAlign: 'center',
                lineHeight: 1.5,
              }}
            >
              This Product Management learning portfolio is private or restricted.
            </p>
            <div
              style={{
                marginTop: '40px',
                fontSize: '16px',
                color: '#6366f1',
                fontWeight: 600,
                letterSpacing: '0.05em',
              }}
            >
              {BRAND.product.toUpperCase()} · LEARNING PLATFORM
            </div>
          </div>
        ),
        { width: 1200, height: 630 }
      )
    }

    const { user, progress, capstones, skillRadar } = portfolio
    const topClusters: string[] = skillRadar?.breakdown
      ? skillRadar.breakdown.slice(0, 4).map((b) => b.label)
      : ['Discovery', 'Strategy', 'Execution', 'Metrics']

    return new ImageResponse(
      (
        <div
          style={{
            height: '100%',
            width: '100%',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            backgroundColor: '#090d16',
            backgroundImage:
              'radial-gradient(circle at 15% 20%, rgba(99, 102, 241, 0.18), transparent 50%), radial-gradient(circle at 85% 80%, rgba(168, 85, 247, 0.15), transparent 50%)',
            color: '#ffffff',
            fontFamily: 'sans-serif',
            padding: '56px 64px',
          }}
        >
          {/* Header Bar */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              width: '100%',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
              }}
            >
              <div
                style={{
                  width: '40px',
                  height: '40px',
                  borderRadius: '10px',
                  backgroundColor: '#4f46e5',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 900,
                  fontSize: '20px',
                  color: '#ffffff',
                  boxShadow: '0 0 20px rgba(99, 102, 241, 0.5)',
                }}
              >
                P
              </div>
              <span
                style={{
                  fontSize: '20px',
                  fontWeight: 800,
                  letterSpacing: '0.04em',
                  color: '#f8fafc',
                }}
              >
                {BRAND.product.toUpperCase()}
              </span>
            </div>

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '6px 14px',
                borderRadius: '9999px',
                backgroundColor: user.isFellow ? 'rgba(16, 185, 129, 0.15)' : 'rgba(99, 102, 241, 0.15)',
                border: user.isFellow ? '1px solid rgba(16, 185, 129, 0.35)' : '1px solid rgba(99, 102, 241, 0.35)',
                color: user.isFellow ? '#34d399' : '#818cf8',
                fontSize: '14px',
                fontWeight: 700,
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
              }}
            >
              {user.isFellow ? 'PM Fellow at Prodily' : 'Product Portfolio'}
            </div>
          </div>

          {/* Center Profile & Credentials */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '20px',
              }}
            >
              {user.avatarUrl ? (
                <img
                  src={user.avatarUrl}
                  alt={user.name}
                  style={{
                    width: '84px',
                    height: '84px',
                    borderRadius: '9999px',
                    border: '3px solid #6366f1',
                    objectFit: 'cover',
                  }}
                />
              ) : (
                <div
                  style={{
                    width: '84px',
                    height: '84px',
                    borderRadius: '9999px',
                    backgroundColor: '#1e293b',
                    border: '3px solid #6366f1',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '36px',
                    fontWeight: 800,
                    color: '#818cf8',
                  }}
                >
                  {user.name.charAt(0).toUpperCase()}
                </div>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <h1
                  style={{
                    fontSize: '44px',
                    fontWeight: 900,
                    margin: 0,
                    letterSpacing: '-0.02em',
                    color: '#ffffff',
                  }}
                >
                  {user.name}
                </h1>
                {user.isFellow && (
                  <div
                    style={{
                      fontSize: '18px',
                      fontWeight: 700,
                      color: '#34d399',
                      marginTop: '2px',
                    }}
                  >
                    Product Management Fellow at Prodily
                  </div>
                )}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                  }}
                >
                  <span style={{ fontSize: '18px', color: '#94a3b8', fontWeight: 600 }}>
                    @{user.username}
                  </span>
                  <span style={{ color: '#475569' }}>•</span>
                  <span
                    style={{
                      fontSize: '16px',
                      color: '#a855f7',
                      fontWeight: 700,
                      backgroundColor: 'rgba(168, 85, 247, 0.15)',
                      padding: '2px 10px',
                      borderRadius: '6px',
                      border: '1px solid rgba(168, 85, 247, 0.3)',
                    }}
                  >
                    Level {user.levelInfo.level} · {user.totalXp.toLocaleString()} XP
                  </span>
                </div>
              </div>
            </div>

            {user.bio && (
              <p
                style={{
                  fontSize: '18px',
                  color: '#cbd5e1',
                  margin: 0,
                  maxWidth: '850px',
                  lineHeight: 1.4,
                  display: '-webkit-box',
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical',
                  overflow: 'hidden',
                }}
              >
                {user.bio}
              </p>
            )}
          </div>

          {/* Stats Bar */}
          <div
            style={{
              display: 'flex',
              gap: '16px',
              width: '100%',
            }}
          >
            <div
              style={{
                flex: 1,
                padding: '16px 20px',
                borderRadius: '16px',
                backgroundColor: 'rgba(30, 41, 59, 0.6)',
                border: '1px solid rgba(148, 163, 184, 0.15)',
                display: 'flex',
                flexDirection: 'column',
                gap: '4px',
              }}
            >
              <span style={{ fontSize: '13px', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase' }}>
                Total XP Earned
              </span>
              <span style={{ fontSize: '26px', fontWeight: 900, color: '#f8fafc' }}>
                {user.totalXp.toLocaleString()} XP
              </span>
            </div>

            <div
              style={{
                flex: 1,
                padding: '16px 20px',
                borderRadius: '16px',
                backgroundColor: 'rgba(30, 41, 59, 0.6)',
                border: '1px solid rgba(148, 163, 184, 0.15)',
                display: 'flex',
                flexDirection: 'column',
                gap: '4px',
              }}
            >
              <span style={{ fontSize: '13px', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase' }}>
                Modules Mastered
              </span>
              <span style={{ fontSize: '26px', fontWeight: 900, color: '#6366f1' }}>
                {progress.completedModulesCount} / 9
              </span>
            </div>

            <div
              style={{
                flex: 1,
                padding: '16px 20px',
                borderRadius: '16px',
                backgroundColor: 'rgba(30, 41, 59, 0.6)',
                border: '1px solid rgba(148, 163, 184, 0.15)',
                display: 'flex',
                flexDirection: 'column',
                gap: '4px',
              }}
            >
              <span style={{ fontSize: '13px', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase' }}>
                Applied Projects
              </span>
              <span style={{ fontSize: '26px', fontWeight: 900, color: '#10b981' }}>
                {capstones.length} Capstones
              </span>
            </div>

            <div
              style={{
                flex: 1.2,
                padding: '16px 20px',
                borderRadius: '16px',
                backgroundColor: 'rgba(30, 41, 59, 0.6)',
                border: '1px solid rgba(148, 163, 184, 0.15)',
                display: 'flex',
                flexDirection: 'column',
                gap: '6px',
              }}
            >
              <span style={{ fontSize: '13px', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase' }}>
                Core Competencies
              </span>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                {topClusters.slice(0, 3).map((clusterName: string, idx: number) => (
                  <span
                    key={idx}
                    style={{
                      fontSize: '12px',
                      fontWeight: 700,
                      color: '#cbd5e1',
                      backgroundColor: 'rgba(148, 163, 184, 0.15)',
                      padding: '2px 8px',
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
              fontSize: '13px',
              color: '#64748b',
              borderTop: '1px solid rgba(148, 163, 184, 0.15)',
              paddingTop: '16px',
            }}
          >
            <span>Live Portfolio: prodily.adityagangwani.me/p/{user.username}</span>
            <span>Continuous Product Management Evaluation · No Dark Patterns</span>
          </div>
        </div>
      ),
      {
        width: 1200,
        height: 630,
      }
    )
  } catch (error) {
    console.error('[API GET /api/og/portfolio/[username]] Error:', error)
    return new Response('Failed to generate OpenGraph preview image', { status: 500 })
  }
}
