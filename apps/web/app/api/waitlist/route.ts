import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createServerSupabaseClient } from '@/lib/supabase'
import type { ApiSuccess, ApiError } from '@/types'
import { ROLE_OPTIONS } from '@/types'
import { sendWaitlistConfirmationEmail } from '@/lib/email'

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
  current_role: z.enum(ROLE_OPTIONS, {
    message: 'Please select a role from the list.',
  }),
  // Optional UTM attribution — captured client-side from URL
  utm_source:   z.string().max(100).optional().nullable(),
  utm_medium:   z.string().max(100).optional().nullable(),
  utm_campaign: z.string().max(100).optional().nullable(),
})

// ─── Simple in-memory rate limiting ──────────────────────────────────────────
// Sufficient for MVP. Replace with Upstash/Redis at scale.

const rateLimitMap = new Map<string, { count: number; resetAt: number }>()
const RATE_LIMIT = { MAX: 5, WINDOW_MS: 60_000 } // 5 per minute per IP

function checkRateLimit(ip: string): boolean {
  const now = Date.now()
  const entry = rateLimitMap.get(ip)

  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT.WINDOW_MS })
    return true
  }

  if (entry.count >= RATE_LIMIT.MAX) return false

  entry.count++
  return true
}

// ─── Route Handler ────────────────────────────────────────────────────────────

export async function POST(request: NextRequest): Promise<NextResponse<ApiSuccess | ApiError>> {
  // Rate limiting by IP
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
  if (!checkRateLimit(ip)) {
    return NextResponse.json(
      { error: 'Too many requests. Please try again in a moment.', code: 'SERVER_ERROR' },
      { status: 429 }
    )
  }

  // Parse request body
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json(
      { error: 'Invalid request format.', code: 'VALIDATION' },
      { status: 400 }
    )
  }

  // Validate inputs
  const result = waitlistSchema.safeParse(body)
  if (!result.success) {
    const firstError = result.error.issues[0]?.message ?? 'Invalid input.'
    return NextResponse.json(
      { error: firstError, code: 'VALIDATION' },
      { status: 422 }
    )
  }

  const { name, email, current_role, utm_source, utm_medium, utm_campaign } = result.data

  // Capture attribution — server-side (referrer from request headers)
  const referrer = request.headers.get('referer') ?? null
  const source = utm_source ?? 'direct'

  // Supabase operations
  try {
    const supabase = createServerSupabaseClient()

    // Check for duplicate email
    const { data: existing } = await supabase
      .from('waitlist')
      .select('id')
      .eq('email', email)
      .maybeSingle()

    if (existing) {
      return NextResponse.json(
        { error: 'You are already on the waitlist. We will be in touch.', code: 'DUPLICATE' },
        { status: 409 }
      )
    }

    // Insert new waitlist entry
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: insertError } = await (supabase.from('waitlist') as any).insert({
      name,
      email,
      current_role,
      source,
      utm_source:   utm_source   ?? null,
      utm_medium:   utm_medium   ?? null,
      utm_campaign: utm_campaign ?? null,
      referrer,
    })

    if (insertError) {
      // Supabase unique constraint violation (race condition safety net)
      if (insertError.code === '23505') {
        return NextResponse.json(
          { error: 'You are already on the waitlist. We will be in touch.', code: 'DUPLICATE' },
          { status: 409 }
        )
      }

      console.error('[waitlist] Insert error:', insertError.message)
      return NextResponse.json(
        { error: 'Something went wrong on our side. Try again in a moment.', code: 'SERVER_ERROR' },
        { status: 500 }
      )
    }

    // Send waitlist confirmation email (asynchronous, non-blocking)
    sendWaitlistConfirmationEmail({ name, email }).catch((err) => {
      console.error('[waitlist] Error sending confirmation email:', err)
    })

    return NextResponse.json(
      { message: 'You are on the waitlist.' },
      { status: 201 }
    )

  } catch (error) {
    console.error('[waitlist] Unexpected error:', error)
    return NextResponse.json(
      { error: 'Something went wrong on our side. Try again in a moment.', code: 'SERVER_ERROR' },
      { status: 500 }
    )
  }
}
