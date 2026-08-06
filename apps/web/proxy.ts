import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { isAdminEmail } from '@/lib/admin/authorization'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

const AUTH_PAGE_TARGET_LEARNER = '/dashboard'
const AUTH_PAGE_TARGET_ADMIN = '/admin'
const ADMIN_LOGIN_PAGE = '/admin/login'
const ACCESS_DENIED_PAGE = '/admin/access-denied'

/**
 * Attaches refreshed session cookies to a redirect/next response so a token
 * exchange performed here is not lost on the client redirect.
 */
function withSessionCookies(
  response: NextResponse,
  session: { access_token: string; refresh_token: string; expires_in: number }
) {
  const isProd = process.env.NODE_ENV === 'production'
  response.cookies.set('sb-access-token', session.access_token, {
    httpOnly: true,
    secure: isProd,
    sameSite: 'lax',
    path: '/',
    maxAge: session.expires_in,
  })
  response.cookies.set('sb-refresh-token', session.refresh_token, {
    httpOnly: true,
    secure: isProd,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 30, // 30 days
  })
  return response
}

export async function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname

  // Route classification ----------------------------------------------------
  // Auth pages are public and route authenticated users away.
  const isGeneralAuthPage =
    path.startsWith('/login') || path.startsWith('/signup') || path.startsWith('/reset-password')

  // The admin console has its own public login page. It must ALWAYS be
  // reachable by guests; authenticated visitors are routed by authorization.
  const isAdminLoginPage = path === ADMIN_LOGIN_PAGE

  // Access denied is informational and must always render — never redirect.
  const isAccessDeniedPage = path === ACCESS_DENIED_PAGE

  const isAdminArea = path.startsWith('/admin')
  const isAdminProtectedPage = isAdminArea && !isAdminLoginPage && !isAccessDeniedPage

  const isAppPage =
    path.startsWith('/dashboard') ||
    path.startsWith('/review') ||
    path.startsWith('/progress') ||
    path.startsWith('/leaderboard') ||
    path.startsWith('/settings') ||
    path.startsWith('/onboarding') ||
    path.startsWith('/academy') ||
    isAdminProtectedPage ||
    (path.startsWith('/curriculum/') && path !== '/curriculum')

  const isPublicPage = isGeneralAuthPage || isAdminLoginPage || isAccessDeniedPage

  // Fast path for non-guarded public routes
  if (!isPublicPage && !isAppPage) {
    return NextResponse.next()
  }

  const accessToken = request.cookies.get('sb-access-token')?.value
  const refreshToken = request.cookies.get('sb-refresh-token')?.value

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false },
  })

  let user: Awaited<ReturnType<typeof supabase.auth.getUser>>['data']['user'] | null = null
  let newSession: { access_token: string; refresh_token: string; expires_in: number } | null = null

  // 1. Verify access token
  if (accessToken) {
    const { data, error } = await supabase.auth.getUser(accessToken)
    if (!error && data.user) {
      user = data.user
    }
  }

  // 2. Fallback: Attempt refresh token exchange
  if (!user && refreshToken) {
    try {
      const { data, error } = await supabase.auth.refreshSession({ refresh_token: refreshToken })
      if (!error && data?.session && data?.user) {
        user = data.user
        newSession = data.session
      }
    } catch (err) {
      console.error('[proxy] Refresh session error:', err)
    }
  }

  // Client used for the database authorization check. It must carry the active
  // access token so RLS allows the user to read their own `users` row.
  const activeAccessToken = newSession?.access_token ?? accessToken
  const authorizedClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: activeAccessToken ? { Authorization: `Bearer ${activeAccessToken}` } : {},
    },
    auth: { persistSession: false },
  })

  /**
   * Resolves admin authorization for the current user:
   * ADMIN_EMAILS env var OR user_metadata.is_admin OR users.is_admin (DB).
   */
  async function isAdmin(): Promise<boolean> {
    if (!user) return false
    if (isAdminEmail(user.email)) return true
    if (user.user_metadata?.is_admin) return true

    try {
      const { data } = await authorizedClient
        .from('users')
        .select('is_admin')
        .eq('id', user.id)
        .maybeSingle()
      return Boolean(data?.is_admin)
    } catch (err) {
      console.error('[proxy] Admin database check error:', err)
      return false
    }
  }

  // ── Public auth pages (/login, /signup, /reset-password) ─────────────────
  if (isGeneralAuthPage) {
    if (!user) return NextResponse.next()

    // Authenticated users are routed away. Admins go straight to the console;
    // learners continue to their dashboard. This prevents onboarding from
    // hijacking an admin who merely visited the learner login.
    const target = (await isAdmin()) ? AUTH_PAGE_TARGET_ADMIN : AUTH_PAGE_TARGET_LEARNER
    const response = NextResponse.redirect(new URL(target, request.url))
    return newSession ? withSessionCookies(response, newSession) : response
  }

  // ── Admin login: guests see the form; authenticated users are routed by ──
  //    authorization (never to the learner dashboard).
  if (isAdminLoginPage) {
    if (!user) return NextResponse.next()

    const authorized = await isAdmin()
    const target = authorized ? '/admin' : ACCESS_DENIED_PAGE
    const response = NextResponse.redirect(new URL(target, request.url))
    return newSession ? withSessionCookies(response, newSession) : response
  }

  // ── Access denied: always renderable ─────────────────────────────────────
  if (isAccessDeniedPage) {
    return NextResponse.next()
  }

  // ── Protected application routes ─────────────────────────────────────────
  if (isAppPage) {
    if (!user) {
      const loginTarget = isAdminArea ? ADMIN_LOGIN_PAGE : '/login'
      const response = NextResponse.redirect(new URL(loginTarget, request.url))
      response.cookies.delete('sb-access-token')
      response.cookies.delete('sb-refresh-token')
      return response
    }

    // RBAC for admin routes
    if (isAdminProtectedPage && !(await isAdmin())) {
      const response = NextResponse.redirect(new URL(ACCESS_DENIED_PAGE, request.url))
      return newSession ? withSessionCookies(response, newSession) : response
    }

    const isOnboardingComplete = !!user.user_metadata?.onboarding_complete
    const isOnboardingPage = path === '/onboarding'

    if (!isOnboardingComplete && !isOnboardingPage && !isAdminArea) {
      // Force onboarding goal selection for learners (admins are unaffected)
      const response = NextResponse.redirect(new URL('/onboarding', request.url))
      return newSession ? withSessionCookies(response, newSession) : response
    }

    if (isOnboardingComplete && isOnboardingPage) {
      // Skip onboarding since it is already complete
      const response = NextResponse.redirect(new URL('/dashboard', request.url))
      return newSession ? withSessionCookies(response, newSession) : response
    }

    if (newSession) {
      return withSessionCookies(NextResponse.next(), newSession)
    }

    return NextResponse.next()
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    /*
     * Match all paths except:
     * - api routes (other than waitlist and auth callback/session api)
     * - static files (css, js, images, robots, sitemap)
     * - favicon.ico
     */
    '/((?!_next/static|_next/image|favicon.ico|content|brand|robots.txt|sitemap.xml|api/waitlist|api/auth/callback|[^/]*\\.[^/]*$).*)',
  ],
}
