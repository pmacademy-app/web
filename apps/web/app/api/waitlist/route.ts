import { NextResponse } from 'next/server'
import { z } from 'zod'
import { RouteError, withRoute } from '@/lib/api/with-route'
import { createServiceRoleClient } from '@/lib/supabase'
import type { ApiSuccess, ApiError } from '@/types'
import { ROLE_OPTIONS } from '@/types'
import { buildWaitlistConfirmationEmail } from '@/lib/email'
import { sendGovernedEmail } from '@/lib/email-governance'
import { getClientIpBucket } from '@/lib/security/client-ip'

// ─── Validation Schema ────────────────────────────────────────────────────────

const waitlistSchema = z.object({
  name: z
    .string()
    .min(2, 'Name must be at least 2 characters.')
    .max(80, 'Name must be less than 80 characters.')
    .trim(),
  email: z
    .string()
    .email('Enter a valid email address.')
    .toLowerCase()
    .trim(),
  career_position: z.enum(ROLE_OPTIONS, {
    message: 'Please select a role from the list.',
  }),
  // Optional UTM attribution — captured client-side from URL
  utm_source:   z.string().max(100).optional().nullable(),
  utm_medium:   z.string().max(100).optional().nullable(),
  utm_campaign: z.string().max(100).optional().nullable(),
})

// ─── Rate limiting ────────────────────────────────────────────────────────────
//
// This endpoint sends a confirmation email, so it is an independent way to spend
// provider credit — the thing the 2026-09-09 incident was about. It previously used a
// process-local Map keyed on the leftmost `X-Forwarded-For` value, which fails twice
// over: the key is attacker-supplied, and on serverless every cold instance starts
// with an empty map, so the counter rarely survives long enough to deny anything.
// It now uses the persistent, cross-instance limiter on a trusted IP, fail-closed.
const IP_WAITLIST_LIMIT = { windowMs: 60 * 60 * 1000, limit: 5, failClosed: true }

// ─── Route Handler ────────────────────────────────────────────────────────────

/**
 * Public by design — the waitlist form is on the marketing site.
 *
 * The limiter stays declared on the wrapper and the body stays undeclared, so the
 * order this endpoint shipped with is unchanged: charge the trusted-IP bucket
 * first, fail-closed, and only then read the body. Validation is also kept in the
 * handler because a schema failure here answers **422**, not the wrapper's 400.
 */
export const POST = withRoute(
  {
    actor: { allow: ['anonymous', 'learner'] },
    operation: 'waitlist.join',
    summary: 'Unexpected failure recording a waitlist signup',
    errorMessage: 'Something went wrong on our side. Try again in a moment.',
    rateLimit: [
      {
        key: ({ request }) => `waitlist_ip:${getClientIpBucket(request)}`,
        ...IP_WAITLIST_LIMIT,
      },
    ],
  },
  async ({ request }): Promise<NextResponse<ApiSuccess | ApiError>> => {
  const ipBucket = getClientIpBucket(request)

  // Parse request body
  let body: unknown
  try {
    body = await request.json()
  } catch {
    throw new RouteError(400, 'VALIDATION', 'Invalid request format.')
  }

  // Validate inputs
  const result = waitlistSchema.safeParse(body)
  if (!result.success) {
    const firstError = result.error.issues[0]?.message ?? 'Invalid input.'
    throw new RouteError(422, 'VALIDATION', firstError)
  }

  const { name, email, career_position, utm_source, utm_medium, utm_campaign } = result.data

  // Capture attribution — server-side (referrer from request headers)
  const referrer = request.headers.get('referer') ?? null
  const source = utm_source ?? 'direct'

  // Supabase operations
  {
    const supabase = createServiceRoleClient()

    // Check for duplicate email
    const { data: existing } = await supabase
      .from('waitlist')
      .select('id')
      .eq('email', email)
      .maybeSingle()

    if (existing) {
      throw new RouteError(409, 'DUPLICATE', 'You are already on the waitlist. We will be in touch.')
    }

    // Insert new waitlist entry
    const { error: insertError } = await supabase.from('waitlist').insert({
      name,
      email,
      career_position,
      source,
      utm_source:   utm_source   ?? null,
      utm_medium:   utm_medium   ?? null,
      utm_campaign: utm_campaign ?? null,
      referrer,
    })

    if (insertError) {
      // Supabase unique constraint violation (race condition safety net)
      if (insertError.code === '23505') {
        throw new RouteError(409, 'DUPLICATE', 'You are already on the waitlist. We will be in touch.')
      }

      console.error('[waitlist] Insert error:', insertError.message)
      throw new RouteError(500, 'SERVER_ERROR', 'Something went wrong on our side. Try again in a moment.')
    }

    // Send the confirmation through the governed gateway (asynchronous, non-blocking).
    // The waitlist row above is the durable state this email is attached to, and the
    // idempotency key is derived from the address, so a duplicate submission that
    // somehow got past the 23505 check still cannot produce a second send.
    const waitlistEmail = buildWaitlistConfirmationEmail({ name })
    void sendGovernedEmail({
      purpose: 'waitlist.confirmation',
      to: email,
      subject: waitlistEmail.subject,
      html: waitlistEmail.html,
      text: waitlistEmail.text,
      idempotencyKey: `waitlist:${email.toLowerCase()}`,
      ipBucket,
    }).catch((err) => {
      console.error('[waitlist] Error sending confirmation email:', err)
    })

    return NextResponse.json(
      { message: 'You are on the waitlist.' },
      { status: 201 }
    )
  }
  }
)
