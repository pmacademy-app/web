import { withRoute } from '@/lib/api/with-route'
import { recordPortfolioView } from '@/lib/portfolio/portfolio-db'
import { evaluateInMemoryRateLimit } from '@/lib/rate-limit'
import { getClientIpBucket } from '@/lib/security/client-ip'
import { createServiceRoleClient } from '@/lib/supabase'

/**
 * POST /api/portfolio/[username]/view
 *
 * The view counter for public portfolios (perf plan item 13). It used to run inside the page
 * render, which kept /p/[username] from being cached. The cached page now sends this beacon
 * once per visit (components/portfolio/PortfolioViewBeacon.tsx).
 *
 * Anonymous by policy and only anonymous: resolving a session would cost an auth call per view,
 * and the previous render-time counter did not tell owners apart either. The count is a vanity
 * number, so the limit is the cheap in-process one, one counted view per IP per portfolio per
 * window. It is per instance, so a visitor spread over instances can count more than once; that
 * is accepted for this number and it adds no database write to every view. The answer is always
 * 204 with no body, so the route says nothing about whether a username exists or is public.
 */
const VIEW_WINDOW_MS = 30 * 60 * 1000
const USERNAME_SHAPE = /^[a-z0-9_-]{1,64}$/

function noContent(): Response {
  return new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } })
}

export const POST = withRoute(
  {
    actor: { allow: ['anonymous'] },
    operation: 'portfolio.view.record',
    summary: 'Unexpected failure recording a portfolio view',
  },
  async ({ request, params }) => {
    const username = (params.username ?? '').trim().toLowerCase()
    if (!USERNAME_SHAPE.test(username)) return noContent()

    const limit = evaluateInMemoryRateLimit(`portfolio_view:${getClientIpBucket(request)}:${username}`, {
      limit: 1,
      windowMs: VIEW_WINDOW_MS,
    })
    if (!limit.success) return noContent()

    await recordPortfolioView(createServiceRoleClient(), username)
    return noContent()
  }
)
