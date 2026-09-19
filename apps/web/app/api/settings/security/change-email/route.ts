import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '@supabase/supabase-js'
import { createServiceRoleClient } from '@/lib/supabase'
import { requireUserId } from '@/lib/api/actor'
import { RouteError, withRoute } from '@/lib/api/with-route'
import { evaluateRateLimit } from '@/lib/rate-limit'
import { BRAND } from '@/lib/brand'
import { logSystemError } from '@/lib/monitoring/logger'

export const runtime = 'nodejs'

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * Maps a Supabase Auth `updateUser({ email })` failure to safe, authored copy.
 * Returns `null` for anything not recognized so the caller can rethrow it — an
 * unmapped error is a genuine fault, not a user-facing one, and must go through
 * `withRoute`'s generic handling rather than reach the client as raw provider text.
 */
function describeEmailUpdateError(error: { code?: string; message?: string }): string | null {
  switch (error.code) {
    case 'email_exists':
    case 'identity_already_exists':
    case 'email_conflict_identity_not_deletable':
      return 'This email address is already associated with another account.'
    case 'email_address_invalid':
    case 'validation_failed':
      return 'Please enter a valid email address.'
    case 'over_email_send_rate_limit':
      return 'Too many email change attempts. Please try again later.'
    default:
      break
  }

  // Some providers/mocks report the same conditions without a stable `code`.
  if (/already.*registered|already.*exists/i.test(error.message || '')) {
    return 'This email address is already associated with another account.'
  }

  return null
}

/**
 * GET returns the authenticated user's current email (for display in Settings → Security).
 */
export const GET = withRoute(
  {
    actor: { allow: ['learner'] },
    operation: 'settings.security.read_email',
    domain: 'auth',
    summary: 'Unexpected failure reading the learner email address',
  },
  async ({ actor }) => {
    const email = actor.kind === 'learner' ? actor.email : null
    if (!email) {
      throw new RouteError(401, 'UNAUTHORIZED', 'Authentication required.')
    }

    return NextResponse.json({ success: true, email })
  }
)

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
export const POST = withRoute(
  {
    actor: { allow: ['learner'] },
    operation: 'settings.security.change_email',
    domain: 'auth',
    summary: 'Unexpected failure changing a learner email address',
  },
  async ({ request, actor }) => {
  try {
    const contentType = request.headers.get('content-type') || ''
    if (!contentType.includes('application/json')) {
      return NextResponse.json(
        { success: false, error: 'Unsupported Content-Type. Expected application/json' },
        { status: 415 }
      )
    }

    const userId = requireUserId(actor)
    const userEmail = actor.kind === 'learner' ? actor.email : null
    if (!userEmail) {
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

    if (newEmail === userEmail.trim().toLowerCase()) {
      return NextResponse.json({ success: false, error: 'This is already your current email address.' }, { status: 400 })
    }

    // Rate-limit change requests to slow account-takeover / enumeration attempts.
    const rateCheck = await evaluateRateLimit(`change_email_${userId}`, { limit: 5, windowMs: 60 * 60 * 1000 })
    if (!rateCheck.success) {
      return NextResponse.json(
        { success: false, error: 'Too many email change attempts. Please try again later.' },
        { status: 429 }
      )
    }

    const supabase = createServiceRoleClient()

    // 1. Re-authenticate with current password (defense against session hijacking).
    const { error: verifyError } = await supabase.auth.signInWithPassword({
      email: userEmail,
      password: currentPassword,
    })

    if (verifyError) {
      return NextResponse.json({ success: false, error: 'Current password is incorrect.' }, { status: 400 })
    }

    // 2. Reject if the new email is already associated with another account.
    // (Supabase Auth independently enforces this too — this is the faster,
    // friendlier error path; defense in depth, not the only check.)
    //
    // Exact match on the already-lowercased `newEmail`, not `.ilike()`: an ILIKE
    // pattern treats `%`/`_` in the caller-supplied value as wildcards, which
    // would let an authenticated caller probe for other accounts' email
    // addresses via the 409 response. Emails are stored lowercase at signup, so
    // an exact match on the canonicalized value preserves the intended
    // case-insensitive comparison without passing user input through as a
    // pattern.
    const { data: existing } = await supabase
      .from('users')
      .select('id')
      .eq('email', newEmail)
      .maybeSingle()

    if (existing && existing.id !== userId) {
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
      { emailRedirectTo: `${BRAND.siteUrl}/email-verified` }
    )

    if (updateError) {
      void logSystemError({
        severity: 'warning',
        category: 'auth',
        operation: 'settings_email_change_failure',
        message: updateError.message,
      })

      const safeMessage = describeEmailUpdateError(updateError)
      if (safeMessage) {
        return NextResponse.json({ success: false, error: safeMessage }, { status: 400 })
      }
      // Unrecognized failure: rethrown so the wrapper genericizes it rather than
      // forwarding raw provider text (N-3 / audit finding D-4).
      throw updateError
    }

    return NextResponse.json({
      success: true,
      message: `Confirmation link sent to ${newEmail}. Your email will change once you confirm.`,
    })
  } catch (error: unknown) {
    // Rethrown so the wrapper genericises it; this branch previously returned
    // error.message to an authenticated learner (N-3).
    throw error
  }
  }
)
