import { NextResponse } from 'next/server'
import { withRoute } from '@/lib/api/with-route'
import { BRAND } from '@/lib/brand'
import { createServiceRoleClient } from '@/lib/supabase'
import { log } from '@/lib/monitoring/log'

/**
 * Deliberately open to every actor kind, and deliberately keeps its own catch.
 *
 * The caller is an unsubscribe link in an email client: there is no session to
 * resolve, and the `unsubscribe_token` is the credential. It is not modelled as an
 * actor kind for the same reason the webhooks are not: the secret identifies a
 * preference row, not a person.
 *
 * GET never writes. Mail security scanners fetch every link in a message, so a GET
 * that unsubscribed would opt learners out without them clicking anything. GET only
 * checks the token and renders a confirm page whose button POSTs it back.
 *
 * POST performs the update. It accepts the token from the query string (RFC 8058
 * one-click, where the mail client POSTs `List-Unsubscribe=One-Click` to the URL in
 * the `List-Unsubscribe` header) or from the confirm form's `token` field. The
 * route is excluded from the proxy matcher and exempt from the SEC-12 origin
 * check, so a cross-site one-click POST from a mail provider reaches it.
 *
 * The internal try/catch stays because this route answers a browser with HTML and
 * an API caller with JSON. Letting a fault reach the wrapper would hand a browser a
 * JSON error envelope instead of the styled page.
 */

const HTML_HEADERS = { 'Content-Type': 'text/html; charset=utf-8' }

type ServiceClient = ReturnType<typeof createServiceRoleClient>

function wantsJson(request: Request): boolean {
  const format = new URL(request.url).searchParams.get('format')
  return format === 'json' || Boolean(request.headers.get('accept')?.includes('application/json'))
}

function cleanToken(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

/** Token from the URL first (one-click), then from a form body (confirm page). */
async function readPostToken(request: Request): Promise<string | null> {
  const fromQuery = cleanToken(new URL(request.url).searchParams.get('token'))
  if (fromQuery) return fromQuery

  const contentType = request.headers.get('content-type') || ''
  if (contentType.includes('application/x-www-form-urlencoded') || contentType.includes('multipart/form-data')) {
    try {
      const form = await request.formData()
      return cleanToken(form.get('token'))
    } catch {
      return null
    }
  }
  return null
}

/** Throws on a read error so a database fault is never reported as a bad link. */
async function findUserIdByToken(supabase: ServiceClient, token: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('user_notification_preferences')
    .select('user_id')
    .eq('unsubscribe_token', token)
    .maybeSingle()

  if (error) throw new Error(`unsubscribe token lookup failed: ${error.message}`)
  return (data as { user_id?: string } | null)?.user_id ?? null
}

async function performUnsubscribe(supabase: ServiceClient, userId: string): Promise<string | undefined> {
  const { data: userRow, error: userError } = await supabase
    .from('users')
    .select('email')
    .eq('id', userId)
    .maybeSingle()
  if (userError) throw new Error(`unsubscribe user read failed: ${userError.message}`)

  const email = (userRow as { email?: string } | null)?.email?.trim().toLowerCase()

  type DBUpdateChain = {
    update: (data: Record<string, unknown>) => { eq: (col: string, val: string) => PromiseLike<{ error: { message: string } | null }> }
  }
  const { error: updateError } = await (supabase.from('user_notification_preferences') as unknown as DBUpdateChain)
    .update({
      marketing_email: false,
      marketing_in_app: false,
      learning_email: false,
      product_updates_email: false,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId)
  if (updateError) throw new Error(`unsubscribe preference update failed: ${updateError.message}`)

  if (email) {
    type DBUpsertChain = {
      upsert: (data: Record<string, unknown>, opts: { onConflict: string }) => PromiseLike<{ error: { message: string } | null }>
    }
    const { error: suppressError } = await (supabase.from('email_suppressions') as unknown as DBUpsertChain).upsert(
      { email, reason: 'user_unsubscribe', suppressed_at: new Date().toISOString() },
      { onConflict: 'email' }
    )
    if (suppressError) throw new Error(`unsubscribe suppression upsert failed: ${suppressError.message}`)
  }

  return email
}

function missingTokenResponse(isJson: boolean): Response {
  if (isJson) {
    return NextResponse.json({ success: false, error: 'Missing unsubscribe token' }, { status: 400 })
  }
  return new NextResponse(
    renderUnsubscribeHtml({
      title: 'Missing Unsubscribe Token',
      heading: 'Invalid Link',
      message: 'No unsubscribe token was provided in the request.',
      tone: 'error',
    }),
    { status: 400, headers: HTML_HEADERS }
  )
}

function invalidTokenResponse(isJson: boolean): Response {
  if (isJson) {
    return NextResponse.json({ success: false, error: 'Invalid or expired unsubscribe token' }, { status: 404 })
  }
  return new NextResponse(
    renderUnsubscribeHtml({
      title: 'Invalid Link | ' + BRAND.fullName,
      heading: 'Invalid or Expired Link',
      message: 'This unsubscribe link is invalid or has expired. You can manage your preferences directly from settings.',
      tone: 'error',
    }),
    { status: 404, headers: HTML_HEADERS }
  )
}

function failureResponse(isJson: boolean, err: unknown): Response {
  // The exception is logged, never published (N-3).
  log.exception('email.unsubscribe.failed', err)
  if (isJson) {
    return NextResponse.json(
      { success: false, error: 'An unexpected error occurred. Please try again later.' },
      { status: 500 }
    )
  }
  return new NextResponse(
    renderUnsubscribeHtml({
      title: 'Error | ' + BRAND.fullName,
      heading: 'Unable to Unsubscribe',
      message: 'An unexpected error occurred. Please try again later or manage preferences in your account settings.',
      tone: 'error',
    }),
    { status: 500, headers: HTML_HEADERS }
  )
}

export const GET = withRoute(
  {
    actor: { allow: ['anonymous', 'learner', 'admin'] },
    operation: 'email.unsubscribe',
    domain: 'email',
    summary: 'Unexpected failure processing an unsubscribe link',
  },
  async ({ request }) => {
    const isJson = wantsJson(request)
    const token = cleanToken(new URL(request.url).searchParams.get('token'))
    if (!token) return missingTokenResponse(isJson)

    try {
      const userId = await findUserIdByToken(createServiceRoleClient(), token)
      if (!userId) return invalidTokenResponse(isJson)

      if (isJson) {
        return NextResponse.json({
          success: true,
          confirmed: false,
          message: 'Send a POST request to this URL to confirm the unsubscribe.',
        })
      }

      return new NextResponse(
        renderUnsubscribeHtml({
          title: `Unsubscribe | ${BRAND.fullName}`,
          heading: 'Unsubscribe from emails?',
          message: `You will stop receiving non-essential notification emails from ${BRAND.fullName}. Essential security and account emails will still be delivered.`,
          tone: 'confirm',
          confirmToken: token,
        }),
        {
          status: 200,
          headers: { ...HTML_HEADERS, 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' },
        }
      )
    } catch (err) {
      return failureResponse(isJson, err)
    }
  }
)

export const POST = withRoute(
  {
    actor: { allow: ['anonymous', 'learner', 'admin'] },
    operation: 'email.unsubscribe.confirm',
    domain: 'email',
    summary: 'Unexpected failure confirming an unsubscribe',
  },
  async ({ request }) => {
    const isJson = wantsJson(request)
    const token = await readPostToken(request)
    if (!token) return missingTokenResponse(isJson)

    try {
      const supabase = createServiceRoleClient()
      const userId = await findUserIdByToken(supabase, token)
      if (!userId) return invalidTokenResponse(isJson)

      await performUnsubscribe(supabase, userId)

      // The address is deliberately not echoed. Anyone holding the token (a forwarded
      // email, a mail-scanner prefetch log) could otherwise learn whose it is.
      if (isJson) {
        return NextResponse.json({
          success: true,
          message: 'Successfully unsubscribed from non-essential emails.',
        })
      }

      return new NextResponse(
        renderUnsubscribeHtml({
          title: `Unsubscribed | ${BRAND.fullName}`,
          heading: 'You have been unsubscribed',
          message: `You will no longer receive non-essential notification emails from ${BRAND.fullName}. Essential security and account updates will still be delivered.`,
          tone: 'success',
        }),
        { status: 200, headers: HTML_HEADERS }
      )
    } catch (err) {
      return failureResponse(isJson, err)
    }
  }
)

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function renderUnsubscribeHtml(opts: {
  title: string
  heading: string
  message: string
  tone: 'success' | 'error' | 'confirm'
  confirmToken?: string
}) {
  const headingColor = opts.tone === 'error' ? '#dc2626' : BRAND.colors.primary
  const icon = opts.tone === 'success' ? '✓' : opts.tone === 'error' ? '⚠️' : ''
  const form = opts.confirmToken
    ? `<form method="post" action="/api/email/unsubscribe?token=${encodeURIComponent(opts.confirmToken)}">
        <input type="hidden" name="token" value="${escapeHtml(opts.confirmToken)}">
        <button type="submit">Unsubscribe</button>
      </form>`
    : ''
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="robots" content="noindex">
    <meta name="color-scheme" content="light">
    <title>${opts.title}</title>
    <style>
      body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: ${BRAND.colors.background}; padding: 40px 20px; text-align: center; color: ${BRAND.colors.foreground}; margin: 0; }
      .card { max-width: 480px; margin: 0 auto; background: #ffffff; padding: 36px 28px; border-radius: 12px; border: 1px solid #e5e7eb; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); }
      .icon { font-size: 36px; margin-bottom: 12px; }
      h1 { color: ${headingColor}; font-size: 22px; margin: 0 0 12px 0; font-weight: 700; }
      p { color: #4b5563; font-size: 14px; line-height: 1.6; margin: 0 0 20px 0; }
      form { margin: 0 0 16px 0; }
      button { font: inherit; font-size: 14px; font-weight: 600; color: #ffffff; background: ${BRAND.colors.primary}; border: 1px solid ${BRAND.colors.primary}; padding: 10px 20px; border-radius: 6px; cursor: pointer; }
      button:focus-visible, a:focus-visible { outline: 2px solid ${BRAND.colors.primary}; outline-offset: 2px; }
      a { display: inline-block; color: ${BRAND.colors.primary}; font-size: 14px; font-weight: 600; text-decoration: none; border: 1px solid ${BRAND.colors.primary}; padding: 8px 16px; border-radius: 6px; }
      a:hover { background-color: #f3f4f6; }
    </style>
  </head>
  <body>
    <div class="card">
      ${icon ? `<div class="icon">${icon}</div>` : ''}
      <h1>${opts.heading}</h1>
      <p>${opts.message}</p>
      ${form}
      <a href="/settings?tab=notifications">Manage Notification Settings</a>
    </div>
  </body>
</html>`
}
