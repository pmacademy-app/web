import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { logSystemError } from '@/lib/monitoring/logger'

export const runtime = 'nodejs'

export async function POST(request: NextRequest): Promise<NextResponse> {
  const isProd = process.env.NODE_ENV === 'production'
  try {
    const body = await request.json().catch(() => ({}))
    const bodyRefreshToken = body && typeof body.refresh_token === 'string' ? body.refresh_token.trim() : null
    const cookieRefreshToken = request.cookies.get('sb-refresh-token')?.value || null

    const refreshToken = bodyRefreshToken || cookieRefreshToken

    if (!refreshToken) {
      return NextResponse.json(
        { error: 'Refresh token is required.', code: 'VALIDATION' },
        { status: 400 }
      )
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

    if (!supabaseUrl || !supabaseAnonKey) {
      return NextResponse.json(
        { error: 'Authentication service unavailable.', code: 'SERVER_ERROR' },
        { status: 500 }
      )
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: false },
    })

    const { data, error } = await supabase.auth.refreshSession({ refresh_token: refreshToken })

    if (error || !data.session || !data.user) {
      const response = NextResponse.json(
        { error: 'Invalid or expired refresh token.', code: 'UNAUTHORIZED' },
        { status: 401 }
      )
      // Invalidate stale session cookies on failed refresh
      response.cookies.set('sb-access-token', '', {
        httpOnly: true,
        secure: isProd,
        sameSite: 'lax',
        path: '/',
        maxAge: -1,
      })
      response.cookies.set('sb-refresh-token', '', {
        httpOnly: true,
        secure: isProd,
        sameSite: 'lax',
        path: '/',
        maxAge: -1,
      })
      return response
    }

    const response = NextResponse.json(
      {
        success: true,
        session: data.session,
        user: {
          id: data.user.id,
          email: data.user.email,
        },
      },
      { status: 200 }
    )

    response.cookies.set('sb-access-token', data.session.access_token, {
      httpOnly: true,
      secure: isProd,
      sameSite: 'lax',
      path: '/',
      maxAge: data.session.expires_in || 3600,
    })

    response.cookies.set('sb-refresh-token', data.session.refresh_token, {
      httpOnly: true,
      secure: isProd,
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 30, // 30 days
    })

    return response
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown refresh error'
    void logSystemError({
      severity: 'error',
      category: 'auth',
      operation: 'token_refresh_failure',
      message: errorMsg,
      details: {
        stage: 'api_auth_refresh',
      },
    })

    console.error('[api/auth/refresh] Error refreshing session:', err)
    return NextResponse.json(
      { error: 'Failed to refresh session.', code: 'SERVER_ERROR' },
      { status: 500 }
    )
  }
}
