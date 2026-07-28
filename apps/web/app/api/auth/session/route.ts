import { NextRequest, NextResponse } from 'next/server'
import type { ApiSuccess, ApiError } from '@/types'

export async function POST(
  request: NextRequest
): Promise<NextResponse<ApiSuccess | ApiError>> {
  try {
    const body = await request.json()
    const { session } = body

    const response = NextResponse.json(
      { message: 'Session updated successfully.' },
      { status: 200 }
    )

    if (session) {
      const { access_token, refresh_token, expires_in } = session

      // Set access token cookie (HTTP-only)
      response.cookies.set('sb-access-token', access_token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: expires_in || 3600,
      })

      // Set refresh token cookie (HTTP-only)
      response.cookies.set('sb-refresh-token', refresh_token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: 60 * 60 * 24 * 30, // 30 days
      })
    } else {
      // Clear cookies on sign out
      response.cookies.set('sb-access-token', '', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: -1,
      })
      response.cookies.set('sb-refresh-token', '', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: -1,
      })
    }

    return response
  } catch (error) {
    console.error('[api/auth/session] Error setting session cookies:', error)
    return NextResponse.json(
      { error: 'Failed to sync authentication session.', code: 'SERVER_ERROR' },
      { status: 500 }
    )
  }
}
