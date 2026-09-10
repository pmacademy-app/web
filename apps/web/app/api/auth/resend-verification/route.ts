import { NextRequest, NextResponse } from 'next/server'
import { evaluatePersistentRateLimit } from '@/lib/rate-limit'
import { getClientIpBucket, getTrustedClientIp } from '@/lib/security/client-ip'
import { verifyTurnstileToken, evaluateSiteverifyBudget } from '@/lib/security/turnstile'
import { createServiceRoleClient } from '@/lib/supabase'
import { logSystemError } from '@/lib/monitoring/logger'
import { classifyAuthError } from '@/lib/auth/errors'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  try {
    let email: string | undefined
    let turnstileToken: unknown
    try {
      const body = await request.json()
      email = body.email
      turnstileToken = body.turnstileToken
    } catch {
      // Body optional if authenticated
    }

    const targetEmail = (email || '').trim().toLowerCase()

    if (!targetEmail) {
      return NextResponse.json({ success: false, error: 'Email address is required' }, { status: 400 })
    }

    // 1. Rate limits.
    //
    // The per-email 60s throttle alone was not an abuse control: this endpoint calls
    // `supabase.auth.resend()`, which fires the GoTrue hook and spends provider
    // credit, and an attacker rotating addresses got a fresh 60s bucket for every one
    // of them. A trusted-IP budget and a platform-wide hourly ceiling now sit
    // alongside it, and all three fail closed.
    const ipBucket = getClientIpBucket(request)
    const [rateLimit, ipLimit, aggregateLimit] = await Promise.all([
      evaluatePersistentRateLimit(`verify_resend:${targetEmail}`, {
        windowMs: 60 * 1000,
        limit: 1,
        failClosed: true,
      }),
      evaluatePersistentRateLimit(`verify_resend_ip:${ipBucket}`, {
        windowMs: 60 * 60 * 1000,
        limit: 10,
        failClosed: true,
      }),
      evaluatePersistentRateLimit('verify_resend_global', {
        windowMs: 60 * 60 * 1000,
        limit: 60,
        failClosed: true,
      }),
    ])

    if (!rateLimit.success || !ipLimit.success || !aggregateLimit.success) {
      const resetInMs = Math.max(rateLimit.resetInMs, ipLimit.resetInMs, aggregateLimit.resetInMs)
      const secondsLeft = Math.ceil(resetInMs / 1000)
      return NextResponse.json(
        {
          success: false,
          error: `Please wait ${secondsLeft} second${secondsLeft === 1 ? '' : 's'} before requesting another verification email.`,
          resetInMs,
        },
        { status: 429 }
      )
    }

    // 2. Bot challenge.
    //
    // This endpoint calls `supabase.auth.resend()`, which fires the GoTrue hook and
    // spends provider credit, so it is the endpoint an attacker moves to once signup
    // carries a CAPTCHA. Verification is server-side and mandatory: a client-supplied
    // "I solved it" flag is worth nothing, and the token is adjudicated by Cloudflare.
    //
    // Every refusal below is identical regardless of whether an account exists for the
    // address, so the challenge cannot be used as an existence oracle.
    if (typeof turnstileToken !== 'string' || !turnstileToken.trim()) {
      return NextResponse.json(
        {
          success: false,
          error: 'Security verification failed. Please try again.',
          code: 'CAPTCHA_FAILED',
        },
        { status: 400 }
      )
    }

    const siteverifyBudget = await evaluateSiteverifyBudget()
    if (!siteverifyBudget.success) {
      return NextResponse.json(
        {
          success: false,
          error: 'Please wait a while before requesting another verification email.',
          resetInMs: siteverifyBudget.resetInMs,
        },
        { status: 429 }
      )
    }

    // Cloudflare receives the trusted address only, never the `unresolved` bucket
    // sentinel, which Siteverify would reject as a malformed `remoteip`.
    const turnstileResult = await verifyTurnstileToken(turnstileToken, getTrustedClientIp(request) ?? undefined)
    if (!turnstileResult.success) {
      if (turnstileResult.code === 'CAPTCHA_UNAVAILABLE') {
        return NextResponse.json(
          {
            success: false,
            error: 'Security verification is temporarily unavailable. Please try again in a few moments.',
            code: 'CAPTCHA_UNAVAILABLE',
          },
          { status: 503 }
        )
      }
      return NextResponse.json(
        {
          success: false,
          error: 'Security verification failed. Please try again.',
          code: 'CAPTCHA_FAILED',
        },
        { status: 400 }
      )
    }

    const supabase = createServiceRoleClient()
    const {
      data: { user: sessionUser },
    } = await supabase.auth.getUser()

    // 3. If user is logged in, check if already verified
    if (sessionUser && sessionUser.email_confirmed_at) {
      return NextResponse.json({
        success: true,
        message: 'Your email address is already verified.',
        alreadyVerified: true,
      })
    }

    // 4. Trigger Canonical Supabase Auth Resend Flow
    // Supabase Auth will invoke our Auth Hook (/api/auth/send-email-hook)
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') || 'https://prodily.adityagangwani.me'
    const { error: resendError } = await supabase.auth.resend({
      type: 'signup',
      email: targetEmail,
      options: {
        emailRedirectTo: `${siteUrl}/verified`,
      },
    })

    if (resendError) {
      const classified = classifyAuthError(resendError, 'resend_verification')

      void logSystemError({
        severity: 'warning',
        category: 'verification',
        operation: 'resend_verification',
        message: resendError.message,
        details: { authErrorCode: classified.code, rawCode: classified.rawCode },
      })

      // Check if error is already-verified
      if (resendError.message?.toLowerCase().includes('already confirmed')) {
        return NextResponse.json({
          success: true,
          message: 'Your email address is already verified.',
          alreadyVerified: true,
        })
      }

      // Propagate Supabase-side rate limit as 429 so callers can back off correctly
      const isRateLimited =
        classified.code === 'AUTH_RATE_LIMITED' ||
        resendError.status === 429 ||
        (resendError as { status?: unknown }).status === '429' ||
        (resendError as { code?: unknown }).code === 'over_email_send_rate_limit' ||
        (resendError as { code?: unknown }).code === '429' ||
        (resendError as { code?: unknown }).code === 429 ||
        resendError.message?.toLowerCase().includes('rate limit') ||
        resendError.message?.toLowerCase().includes('over_email_send_rate_limit') ||
        resendError.message?.toLowerCase().includes('after') ||
        resendError.message?.toLowerCase().includes('wait')

      if (isRateLimited) {
        const secondsMatch = resendError.message?.match(/(?:after|wait|every)\s+(\d+)\s+seconds?/i)
        const seconds = secondsMatch ? parseInt(secondsMatch[1], 10) : 60
        return NextResponse.json(
          {
            success: false,
            error: `Please wait ${seconds} second${seconds === 1 ? '' : 's'} before requesting another verification email.`,
            code: 'AUTH_RATE_LIMITED',
            resetInMs: seconds * 1000,
          },
          { status: 429 }
        )
      }

      return NextResponse.json(
        {
          success: false,
          error: 'Unable to resend verification email right now. Please try again in a few minutes.',
          code: classified.code,
        },
        { status: 400 }
      )
    }

    // 5. Return Uniform Success Response (Non-enumerating for unauthenticated)
    return NextResponse.json({
      success: true,
      message: 'If an unverified account exists for this email, a verification link has been sent.',
    })
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown server error'
    void logSystemError({
      severity: 'error',
      category: 'verification',
      operation: 'resend_verification_exception',
      message: errorMsg,
    })

    return NextResponse.json(
      { success: false, error: 'An unexpected error occurred while resending the verification email.' },
      { status: 500 }
    )
  }
}
