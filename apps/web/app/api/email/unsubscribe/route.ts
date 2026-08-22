import { NextResponse } from 'next/server'
import { BRAND } from '@/lib/brand'
import { createServiceRoleClient } from '@/lib/supabase'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const token = searchParams.get('token')
  const format = searchParams.get('format')
  const isJson = format === 'json' || request.headers.get('accept')?.includes('application/json')

  if (!token || typeof token !== 'string' || !token.trim()) {
    if (isJson) {
      return NextResponse.json({ success: false, error: 'Missing unsubscribe token' }, { status: 400 })
    }
    return new NextResponse(
      renderUnsubscribeHtml({
        title: 'Missing Unsubscribe Token',
        heading: 'Invalid Link',
        message: 'No unsubscribe token was provided in the request.',
        success: false,
      }),
      { status: 400, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
    )
  }

  const cleanToken = token.trim()
  const supabase = createServiceRoleClient()

  try {
    // 1. Look up user_notification_preferences by unsubscribe_token
    const { data: prefRow, error: prefError } = await supabase
      .from('user_notification_preferences')
      .select('user_id, marketing_email, learning_email, product_updates_email')
      .eq('unsubscribe_token', cleanToken)
      .maybeSingle()

    if (prefError || !prefRow) {
      if (isJson) {
        return NextResponse.json(
          { success: false, error: 'Invalid or expired unsubscribe token' },
          { status: 404 }
        )
      }
      return new NextResponse(
        renderUnsubscribeHtml({
          title: 'Invalid Link — ' + BRAND.fullName,
          heading: 'Invalid or Expired Link',
          message: 'This unsubscribe link is invalid or has expired. You can manage your preferences directly from settings.',
          success: false,
        }),
        { status: 404, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
      )
    }

    const userId = (prefRow as { user_id: string }).user_id

    // 2. Fetch email address for user
    const { data: userRow } = await supabase
      .from('users')
      .select('email')
      .eq('id', userId)
      .maybeSingle()

    const email = (userRow as { email?: string } | null)?.email?.trim().toLowerCase()

    // 3. Update user notification preferences (disable optional non-critical emails)
    type DBUpdateChain = { update: (data: Record<string, unknown>) => { eq: (col: string, val: string) => Promise<unknown> } }
    await (supabase.from('user_notification_preferences') as unknown as DBUpdateChain)
      .update({
        marketing_email: false,
        marketing_in_app: false,
        learning_email: false,
        product_updates_email: false,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId)

    // 4. Insert or upsert into email_suppressions table (Idempotent)
    if (email) {
      type DBUpsertChain = { upsert: (data: Record<string, unknown>, opts: { onConflict: string }) => Promise<unknown> }
      await (supabase.from('email_suppressions') as unknown as DBUpsertChain).upsert(
        {
          email,
          reason: 'user_unsubscribe',
          suppressed_at: new Date().toISOString(),
        },
        { onConflict: 'email' }
      )
    }

    if (isJson) {
      return NextResponse.json({
        success: true,
        message: 'Successfully unsubscribed from non-essential emails.',
        email,
      })
    }

    return new NextResponse(
      renderUnsubscribeHtml({
        title: `Unsubscribed — ${BRAND.fullName}`,
        heading: 'You have been unsubscribed',
        message: 'You will no longer receive non-essential notification emails from Prodily PM Academy. Essential security and account updates will still be delivered.',
        success: true,
      }),
      { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
    )
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown server error'
    if (isJson) {
      return NextResponse.json({ success: false, error: errorMsg }, { status: 500 })
    }
    return new NextResponse(
      renderUnsubscribeHtml({
        title: 'Error — ' + BRAND.fullName,
        heading: 'Unable to Unsubscribe',
        message: 'An unexpected error occurred. Please try again later or manage preferences in your account settings.',
        success: false,
      }),
      { status: 500, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
    )
  }
}

function renderUnsubscribeHtml(opts: { title: string; heading: string; message: string; success: boolean }) {
  return `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${opts.title}</title>
    <style>
      body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: ${BRAND.colors.background}; padding: 40px 20px; text-align: center; color: ${BRAND.colors.foreground}; margin: 0; }
      .card { max-width: 480px; margin: 0 auto; background: #ffffff; padding: 36px 28px; border-radius: 12px; border: 1px solid #e5e7eb; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); }
      .icon { font-size: 36px; margin-bottom: 12px; }
      h1 { color: ${opts.success ? BRAND.colors.primary : '#dc2626'}; font-size: 22px; margin: 0 0 12px 0; font-weight: 700; }
      p { color: #4b5563; font-size: 14px; line-height: 1.6; margin: 0 0 20px 0; }
      a { display: inline-block; color: ${BRAND.colors.primary}; font-size: 14px; font-weight: 600; text-decoration: none; border: 1px solid ${BRAND.colors.primary}; padding: 8px 16px; border-radius: 6px; }
      a:hover { background-color: #f3f4f6; }
    </style>
  </head>
  <body>
    <div class="card">
      <div class="icon">${opts.success ? '✓' : '⚠️'}</div>
      <h1>${opts.heading}</h1>
      <p>${opts.message}</p>
      <a href="/settings?tab=notifications">Manage Notification Settings</a>
    </div>
  </body>
</html>`
}

