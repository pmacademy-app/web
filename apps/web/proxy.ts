import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export async function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname

  // Determine page category
  const isAuthPage = path.startsWith('/login') || path.startsWith('/signup') || path.startsWith('/reset-password')
  const isAdminPage = path.startsWith('/admin')
  const isAppPage = path.startsWith('/dashboard') || 
                    path.startsWith('/review') || 
                    path.startsWith('/progress') || 
                    path.startsWith('/leaderboard') || 
                    path.startsWith('/settings') || 
                    path.startsWith('/onboarding') ||
                    path.startsWith('/academy') ||
                    isAdminPage ||
                    (path.startsWith('/curriculum/') && path !== '/curriculum')

  // Fast path for non-guarded public routes
  if (!isAuthPage && !isAppPage) {
    return NextResponse.next()
  }

  const accessToken = request.cookies.get('sb-access-token')?.value
  const refreshToken = request.cookies.get('sb-refresh-token')?.value

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false },
  })

  let user = null
  let newSession = null

  // 1. Verify access token
  if (accessToken) {
    const { data: { user: authUser }, error } = await supabase.auth.getUser(accessToken)
    if (!error && authUser) {
      user = authUser
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

  // Auth routes (/login, /signup, /reset-password)
  if (isAuthPage) {
    if (user) {
      // Authenticated users go to dashboard
      return NextResponse.redirect(new URL('/dashboard', request.url))
    }
    return NextResponse.next()
  }

  // Authenticated application routes
  if (isAppPage) {
    if (!user) {
      // Unauthenticated users are redirected to login
      const response = NextResponse.redirect(new URL('/login', request.url))
      response.cookies.delete('sb-access-token')
      response.cookies.delete('sb-refresh-token')
      return response
    }

    const isOnboardingComplete = !!user.user_metadata?.onboarding_complete
    const isOnboardingPage = path === '/onboarding'

    if (!isOnboardingComplete && !isOnboardingPage) {
      // Force onboarding goal selection
      const response = NextResponse.redirect(new URL('/onboarding', request.url))
      if (newSession) {
        response.cookies.set('sb-access-token', newSession.access_token, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax',
          path: '/',
          maxAge: newSession.expires_in,
        })
        response.cookies.set('sb-refresh-token', newSession.refresh_token, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax',
          path: '/',
          maxAge: 60 * 60 * 24 * 30,
        })
      }
      return response
    }

    if (isOnboardingComplete && isOnboardingPage) {
      // Skip onboarding since it is already complete
      const response = NextResponse.redirect(new URL('/dashboard', request.url))
      if (newSession) {
        response.cookies.set('sb-access-token', newSession.access_token, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax',
          path: '/',
          maxAge: newSession.expires_in,
        })
        response.cookies.set('sb-refresh-token', newSession.refresh_token, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax',
          path: '/',
          maxAge: 60 * 60 * 24 * 30,
        })
      }
      return response
    }

    // Set updated cookies on response if token refreshed
    if (newSession) {
      const response = NextResponse.next()
      response.cookies.set('sb-access-token', newSession.access_token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: newSession.expires_in,
      })
      response.cookies.set('sb-refresh-token', newSession.refresh_token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: 60 * 60 * 24 * 30,
      })
      return response
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
    '/((?!_next/static|_next/image|favicon.ico|content|robots.txt|sitemap.xml|api/waitlist|api/auth/callback|og-image.png|[^/]*\\.[^/]*$).*)',
  ],
}
