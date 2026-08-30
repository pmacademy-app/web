import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { isAdminEmail } from '@/lib/admin/authorization'

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

/**
 * Attaches referral attribution cookie (30 days) when ?ref=CODE is detected.
 */
function withReferralCookie(response: NextResponse, refCode?: string | null) {
  if (!refCode) return response
  const isProd = process.env.NODE_ENV === 'production'
  response.cookies.set('prodily_referrer', refCode.trim().replace(/^@/, ''), {
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
  const refParam = request.nextUrl.searchParams.get('ref')
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://mock.supabase.co'
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'mock-anon-key'

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

  // Learner APIs that must be protected against maintenance mode & unverified bypass
  const isApiRoute = path.startsWith('/api/')
  const isExemptApi =
    path.startsWith('/api/auth/') ||
    path.startsWith('/api/admin/') ||
    path.startsWith('/api/cron/') ||
    path.startsWith('/api/email/') ||
    path === '/api/waitlist' ||
    path === '/api/contact'
  const isProtectedLearnerApi = isApiRoute && !isExemptApi

  // Maintenance page must always be reachable so learners see the correct message
  if (path === '/maintenance') {
    return withReferralCookie(NextResponse.next(), refParam)
  }

  // Authenticated learners navigating to public /curriculum are routed to their interactive academy
  if (path === '/curriculum') {
    const hasAuthToken = request.cookies.has('sb-access-token') || request.cookies.has('sb-refresh-token')
    if (hasAuthToken) {
      return withReferralCookie(NextResponse.redirect(new URL('/academy', request.url)), refParam)
    }
  }

  // Fast path for non-guarded public routes
  if (!isPublicPage && !isAppPage && !isProtectedLearnerApi) {
    return withReferralCookie(NextResponse.next(), refParam)
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

  let cachedUserData: { is_admin?: boolean; curriculum_access_override?: boolean } | null = null
  async function loadUserProfileData() {
    if (!user) return null
    if (cachedUserData !== null) return cachedUserData
    try {
      const { data } = await authorizedClient
        .from('users')
        .select('is_admin, curriculum_access_override')
        .eq('id', user.id)
        .maybeSingle()
      cachedUserData = (data || {}) as { is_admin?: boolean; curriculum_access_override?: boolean }
      return cachedUserData
    } catch (err) {
      console.error('[proxy] User profile database check error:', err)
      cachedUserData = {}
      return cachedUserData
    }
  }

  /**
   * Resolves admin authorization for the current user:
   * ADMIN_EMAILS env var OR user_metadata.is_admin OR users.is_admin (DB).
   */
  async function isAdmin(): Promise<boolean> {
    if (!user) return false
    if (isAdminEmail(user.email)) return true
    if (user.app_metadata?.is_admin) return true

    const profileData = await loadUserProfileData()
    return Boolean(profileData?.is_admin)
  }

  async function hasCurriculumAccessOverride(): Promise<boolean> {
    if (!user) return false
    if (user.user_metadata?.curriculum_access_override || user.app_metadata?.curriculum_access_override) return true

    const profileData = await loadUserProfileData()
    return Boolean(profileData?.curriculum_access_override)
  }

  // ── Password Reset Update Mode (Recovery session in progress) ────────────
  // When a user verifies their reset link, they arrive at /reset-password?mode=update
  // with an active recovery session. They MUST be allowed to remain on this page
  // to choose their new password.
  if (path === '/reset-password' && request.nextUrl.searchParams.get('mode') === 'update') {
    if (!user) {
      // If recovery session is missing or expired, redirect to request form
      return withReferralCookie(NextResponse.redirect(new URL('/reset-password?error=expired', request.url)), refParam)
    }
    const response = newSession ? withSessionCookies(NextResponse.next(), newSession) : NextResponse.next()
    return withReferralCookie(response, refParam)
  }

  // ── Public auth pages (/login, /signup, /reset-password) ─────────────────
  if (isGeneralAuthPage) {
    if (!user) return withReferralCookie(NextResponse.next(), refParam)

    // Authenticated users are routed away. Admins go straight to the console;
    // learners continue to their dashboard. This prevents onboarding from
    // hijacking an admin who merely visited the learner login.
    const target = (await isAdmin()) ? AUTH_PAGE_TARGET_ADMIN : AUTH_PAGE_TARGET_LEARNER
    const response = NextResponse.redirect(new URL(target, request.url))
    const sessionRes = newSession ? withSessionCookies(response, newSession) : response
    return withReferralCookie(sessionRes, refParam)
  }

  // ── Admin login: guests see the form; authenticated users are routed by ──
  //    authorization (never to the learner dashboard).
  if (isAdminLoginPage) {
    if (!user) return withReferralCookie(NextResponse.next(), refParam)

    const authorized = await isAdmin()
    const target = authorized ? '/admin' : ACCESS_DENIED_PAGE
    const response = NextResponse.redirect(new URL(target, request.url))
    const sessionRes = newSession ? withSessionCookies(response, newSession) : response
    return withReferralCookie(sessionRes, refParam)
  }

  // ── Access denied: always renderable ─────────────────────────────────────
  if (isAccessDeniedPage) {
    return withReferralCookie(NextResponse.next(), refParam)
  }

  // ── Protected learner API routes (maintenance & email verification) ─────
  if (isProtectedLearnerApi) {
    const { SettingsService } = await import('@/lib/admin/settings-service')
    const productSettings = await SettingsService.getProductSettings()

    // 1. Maintenance mode enforcement on APIs: 503 Service Unavailable for non-admins
    if (productSettings.maintenanceMode && !(await isAdmin())) {
      return NextResponse.json(
        {
          error: 'The platform is currently undergoing scheduled maintenance. Please check back shortly.',
          code: 'MAINTENANCE_MODE',
        },
        { status: 503 }
      )
    }

    // 2. Email verification enforcement on APIs: 403 Forbidden for unverified learners
    if (productSettings.requireEmailVerification && user && !user.email_confirmed_at && !(await isAdmin())) {
      return NextResponse.json(
        {
          error: 'Please verify your email address before accessing platform features.',
          code: 'AUTH_EMAIL_NOT_CONFIRMED',
        },
        { status: 403 }
      )
    }

    if (newSession) {
      return withReferralCookie(withSessionCookies(NextResponse.next(), newSession), refParam)
    }
    return withReferralCookie(NextResponse.next(), refParam)
  }

  // ── Protected application routes ─────────────────────────────────────────
  if (isAppPage) {
    if (!user) {
      const loginTarget = isAdminArea ? ADMIN_LOGIN_PAGE : '/login'
      const response = NextResponse.redirect(new URL(loginTarget, request.url))
      response.cookies.delete('sb-access-token')
      response.cookies.delete('sb-refresh-token')
      return withReferralCookie(response, refParam)
    }

    // RBAC for admin routes
    if (isAdminProtectedPage && !(await isAdmin())) {
      const response = NextResponse.redirect(new URL(ACCESS_DENIED_PAGE, request.url))
      const sessionRes = newSession ? withSessionCookies(response, newSession) : response
      return withReferralCookie(sessionRes, refParam)
    }

    // ── Email verification check for learner protected routes ────────────────
    if (!isAdminArea && !(await isAdmin())) {
      const { SettingsService } = await import('@/lib/admin/settings-service')
      const productSettings = await SettingsService.getProductSettings()

      // Maintenance mode — block all non-admin learners from the app
      if (productSettings.maintenanceMode) {
        const response = NextResponse.redirect(new URL('/maintenance', request.url))
        const sessionRes = newSession ? withSessionCookies(response, newSession) : response
        return withReferralCookie(sessionRes, refParam)
      }

      // Email verification enforcement
      if (productSettings.requireEmailVerification && !user.email_confirmed_at) {
        const response = NextResponse.redirect(new URL('/login?error=email_not_confirmed', request.url))
        const sessionRes = newSession ? withSessionCookies(response, newSession) : response
        return withReferralCookie(sessionRes, refParam)
      }
    }

    const isOnboardingComplete = !!user.user_metadata?.onboarding_complete
    const isOnboardingPage = path === '/onboarding'

    if (!isOnboardingComplete && !isOnboardingPage && !isAdminArea && !(await hasCurriculumAccessOverride())) {
      // Force onboarding goal selection for learners (admins & override users are unaffected)
      const response = NextResponse.redirect(new URL('/onboarding', request.url))
      const sessionRes = newSession ? withSessionCookies(response, newSession) : response
      return withReferralCookie(sessionRes, refParam)
    }

    if (isOnboardingComplete && isOnboardingPage) {
      // Skip onboarding since it is already complete
      const response = NextResponse.redirect(new URL('/dashboard', request.url))
      const sessionRes = newSession ? withSessionCookies(response, newSession) : response
      return withReferralCookie(sessionRes, refParam)
    }

    if (newSession) {
      return withReferralCookie(withSessionCookies(NextResponse.next(), newSession), refParam)
    }

    return withReferralCookie(NextResponse.next(), refParam)
  }

  return withReferralCookie(NextResponse.next(), refParam)
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
