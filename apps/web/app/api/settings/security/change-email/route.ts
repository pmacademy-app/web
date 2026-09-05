import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '@supabase/supabase-js'
import { createServiceRoleClient } from '@/lib/supabase'
import { getAuthenticatedUserFromRequest } from '@/lib/auth'
import { evaluateRateLimit } from '@/lib/rate-limit'
import { BRAND } from '@/lib/brand'
import { logSystemError } from '@/lib/monitoring/logger'

export const runtime = 'nodejs'

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * GET returns the authenticated user's current email (for display in Settings → Security).
 */
export async function GET(request: Request) {
  try {
    const user = await getAuthenticatedUserFromRequest(request)
    if (!user || !user.email) {
      return NextResponse.json({ error: 'Unauthorized. Authenticated session required.' }, { status: 401 })
    }

    return NextResponse.json({ success: true, email: user.email })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'An error occurred.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

/**
 * POST initiates a secure email address change.
 *
 * Reuses Supabase Auth's native email-change confirmation flow end-to-end
 * (the same `send-email-hook` / `/api/auth/callback` pipeline already used
 * for signup verification) rather than building a custom OTP/token system:
 * `auth.updateUser({ email })`, called with the user's own session (not the
 * service-role client), triggers Supabase's standard confirmation email(s).
 * The actual `auth.users.email` change — and the `public.users.email` sync —
 * only happens once the user clicks the confirmation link.
 */
export async function POST(request: Request) {
  try {
    const contentType = request.headers.get('content-type') || ''
    if (!contentType.includes('application/json')) {
      return NextResponse.json(
        { success: false, error: 'Unsupported Content-Type. Expected application/json' },
        { status: 415 }
      )
    }

    const user = await getAuthenticatedUserFromRequest(request)
    if (!user || !user.id || !user.email) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized. Authenticated session required.' },
        { status: 401 }
      )
    }

    let body: { currentPassword?: string; newEmail?: string }
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ success: false, error: 'Invalid JSON payload' }, { status: 400 })
    }

    const currentPassword = body.currentPassword
    const newEmail = (body.newEmail || '').trim().toLowerCase()

    if (!currentPassword || typeof currentPassword !== 'string' || !currentPassword.trim()) {
      return NextResponse.json({ success: false, error: 'Current password is required to change your email.' }, { status: 400 })
    }

    if (!newEmail || !EMAIL_REGEX.test(newEmail)) {
      return NextResponse.json({ success: false, error: 'Please enter a valid email address.' }, { status: 400 })
    }

    if (newEmail === user.email.trim().toLowerCase()) {
      return NextResponse.json({ success: false, error: 'This is already your current email address.' }, { status: 400 })
    }

    // Rate-limit change requests to slow account-takeover / enumeration attempts.
    const rateCheck = await evaluateRateLimit(`change_email_${user.id}`, { limit: 5, windowMs: 60 * 60 * 1000 })
    if (!rateCheck.success) {
      return NextResponse.json(
        { success: false, error: 'Too many email change attempts. Please try again later.' },
        { status: 429 }
      )
    }

    const supabase = createServiceRoleClient()

    // 1. Re-authenticate with current password (defense against session hijacking).
    const { error: verifyError } = await supabase.auth.signInWithPassword({
      email: user.email,
      password: currentPassword,
    })

    if (verifyError) {
      return NextResponse.json({ success: false, error: 'Current password is incorrect.' }, { status: 400 })
    }

    // 2. Reject if the new email is already associated with another account.
    // (Supabase Auth independently enforces this too — this is the faster,
    // friendlier error path; defense in depth, not the only check.)
    const { data: existing } = await supabase
      .from('users')
      .select('id')
      .ilike('email', newEmail)
      .maybeSingle()

    if (existing && existing.id !== user.id) {
      return NextResponse.json(
        { success: false, error: 'This email address is already associated with another account.' },
        { status: 409 }
      )
    }

    // 3. Trigger Supabase Auth's native email-change confirmation flow, acting
    // as the user's own session (required so this is a genuine self-service
    // change, not an admin-forced one, and so the standard confirmation email
    // actually fires).
    const cookieStore = await cookies()
    const accessToken = cookieStore.get('sb-access-token')?.value
    const refreshToken = cookieStore.get('sb-refresh-token')?.value

    if (!accessToken || !refreshToken) {
      return NextResponse.json({ success: false, error: 'Your session has expired. Please sign in again.' }, { status: 401 })
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    if (!supabaseUrl || !anonKey) {
      throw new Error('Missing Supabase environment variables.')
    }

    const sessionClient = createClient(supabaseUrl, anonKey, { auth: { persistSession: false } })
    const { error: sessionError } = await sessionClient.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    })

    if (sessionError) {
      return NextResponse.json({ success: false, error: 'Your session has expired. Please sign in again.' }, { status: 401 })
    }

    const { error: updateError } = await sessionClient.auth.updateUser(
      { email: newEmail },
      { emailRedirectTo: `${BRAND.siteUrl}/settings?tab=security&emailChanged=true` }
    )

    if (updateError) {
      void logSystemError({
        severity: 'warning',
        category: 'auth',
        operation: 'settings_email_change_failure',
        message: updateError.message,
      })

      const alreadyRegistered = /already.*registered|already.*exists/i.test(updateError.message)
      return NextResponse.json(
        {
          success: false,
          error: alreadyRegistered
            ? 'This email address is already associated with another account.'
            : updateError.message || 'Failed to initiate email change.',
        },
        { status: 400 }
      )
    }

    return NextResponse.json({
      success: true,
      message: `Confirmation link sent to ${newEmail}. Your email will change once you confirm.`,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'An error occurred.'
    return NextResponse.json({ success: false, error: message }, { status: 400 })
  }
}
