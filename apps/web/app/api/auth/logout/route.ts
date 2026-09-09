import { NextRequest, NextResponse } from 'next/server'
import { createAuthenticatedServerClient } from '@/lib/supabase'

export const runtime = 'nodejs'

export async function POST(request: NextRequest): Promise<NextResponse> {
  const isProd = process.env.NODE_ENV === 'production'

  const authHeader = request.headers.get('Authorization')
  let accessToken: string | null = null
  if (authHeader?.startsWith('Bearer ')) {
    accessToken = authHeader.substring(7).trim()
  }
  if (!accessToken) {
    accessToken = request.cookies.get('sb-access-token')?.value || null
  }

  // Best-effort server-side session revocation
  if (accessToken) {
    try {
      const authClient = createAuthenticatedServerClient(accessToken)
      await authClient.auth.signOut()
    } catch {
      // Non-fatal: even if provider sign out fails, cookies must still be cleared
    }
  }

  const response = NextResponse.json(
    { success: true, message: 'Logged out successfully.' },
    { status: 200 }
  )

  // Clear HTTP-only session cookies
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
